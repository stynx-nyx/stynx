'use strict';

// Loaded only by the privately owned build launcher, never during installation.
// This observes the public Node24.20 spawn channel; it is not an OS exec tracer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const diagnostics = require('node:diagnostics_channel');
const { isMainThread } = require('node:worker_threads');
const descriptor = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'build-descriptor.json'), 'utf8'),
);
const session = crypto.randomUUID();
const log = path.join(descriptor.logDirectory, `${process.pid}-${session}.jsonl`);
const fd = fs.openSync(log, 'wx', 0o600);
let sequence = 0;
let logBytes = 0;
let refused = false;
const children = new WeakMap();
const pending = new Set();

function append(type, data) {
  const text = JSON.stringify({
    run: descriptor.run,
    session,
    pid: process.pid,
    sequence: sequence++,
    type,
    ...data,
  });
  logBytes += Buffer.byteLength(text) + 1;
  if (Buffer.byteLength(text) > 4 * 1024 * 1024 || logBytes > 64 * 1024 * 1024 || sequence > 10000)
    throw new Error('Build observer transport bound');
  fs.writeSync(fd, `${text}\n`);
}

function fail(reason) {
  refused = true;
  // Never persist an unexpected environment value or arbitrary exception text.
  append('refused', { reason });
}

function sameArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => typeof value === 'string' && value === expected[index])
  );
}

function checkedEnvironment(environment, expected) {
  const result = Object.create(null);
  for (const key of Object.keys(environment)) {
    const value = Object.getOwnPropertyDescriptor(environment, key)?.value;
    if (typeof value !== 'string') throw new Error('environment-type');
    if (
      key === '__CF_USER_TEXT_ENCODING' &&
      process.platform === 'darwin' &&
      /^0x[0-9a-f]+:0x[0-9a-f]+:0x[0-9a-f]+$/iu.test(value)
    ) {
      result[key] = value;
      continue;
    }
    if (!Object.hasOwn(expected, key) || !expected[key].includes(value))
      throw new Error('environment-value');
    result[key] = value;
  }
  for (const key of Object.keys(expected)) {
    if (!Object.hasOwn(result, key) && !expected[key].includes(null))
      throw new Error('environment-missing');
  }
  return result;
}

function fromPairs(pairs) {
  if (!Array.isArray(pairs)) throw new Error('environment-pairs');
  const result = Object.create(null);
  for (const pair of pairs) {
    if (typeof pair !== 'string') throw new Error('environment-pair-type');
    const index = pair.indexOf('=');
    if (index <= 0) throw new Error('environment-pair-shape');
    const key = pair.slice(0, index);
    if (Object.hasOwn(result, key)) throw new Error('environment-duplicate');
    result[key] = pair.slice(index + 1);
  }
  return result;
}

function ownValues(record) {
  if (
    !record ||
    typeof record !== 'object' ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(record))
  )
    throw new Error('option-record');
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(record)) {
    const item = Object.getOwnPropertyDescriptor(record, key);
    if (typeof key !== 'string' || !item.enumerable || !Object.hasOwn(item, 'value'))
      throw new Error('option-accessor');
    result[key] = item.value;
  }
  return result;
}

function stdioReceipt(value) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('stdio-shape');
  return value.map((entry, index) => {
    const item = ownValues(entry);
    if (item.type === 'fd' && item.fd === index && Object.keys(item).length === 2) return item;
    // Pipe handles are opaque. The documented channel supplies the normalized
    // options; no private handle fields or native bindings are inspected.
    if (
      item.type === 'pipe' &&
      typeof item.readable === 'boolean' &&
      typeof item.writable === 'boolean' &&
      Object.keys(item).every((key) => ['type', 'readable', 'writable', 'handle'].includes(key))
    )
      return {
        type: item.type,
        readable: item.readable,
        writable: item.writable,
        handlePresent: Object.hasOwn(item, 'handle'),
      };
    throw new Error('stdio-kind');
  });
}

const startup = descriptor.startups.find(
  (entry) => entry.cwd === process.cwd() && sameArray(process.argv.slice(1), entry.argv),
);
try {
  if (
    !isMainThread ||
    !startup ||
    process.execPath !== descriptor.node ||
    process.versions.node !== '24.20.0' ||
    !sameArray(process.execArgv, ['--require', __filename])
  )
    throw new Error('startup');
  const environment = checkedEnvironment(process.env, startup.environment);
  append('startup', {
    id: startup.id,
    ppid: process.ppid,
    cwd: process.cwd(),
    execPath: process.execPath,
    execArgv: process.execArgv.slice(),
    argv: process.argv.slice(),
    nodeVersion: process.versions.node,
    environment,
  });
} catch {
  fail('unsupported-startup');
  throw new Error('Fresh build observer refused startup');
}

diagnostics.channel('tracing:child_process.spawn:start').subscribe((message) => {
  try {
    if (children.has(message.process)) throw new Error('duplicate-child');
    const options = ownValues(message.options);
    const keys = [
      'cwd',
      'env',
      'stdio',
      'args',
      'detached',
      'envPairs',
      'file',
      'windowsHide',
      'windowsVerbatimArguments',
    ];
    if (
      Object.keys(options).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(options, key)) ||
      options.file !== '/bin/sh' ||
      options.detached !== false ||
      options.windowsHide !== false ||
      options.windowsVerbatimArguments !== false
    )
      throw new Error('spawn-options');
    const lifecycle = descriptor.lifecycles.find(
      (entry) =>
        entry.parent === startup.id &&
        entry.cwd === options.cwd &&
        sameArray(options.args, ['/bin/sh', '-c', entry.script]),
    );
    if (!lifecycle) throw new Error('unknown-lifecycle');
    const pairs = fromPairs(options.envPairs);
    const environment = checkedEnvironment(pairs, lifecycle.environment);
    const env = ownValues(options.env);
    if (
      Object.keys(env).length !== Object.keys(pairs).length ||
      Object.keys(env).some((key) => env[key] !== pairs[key])
    )
      throw new Error('environment-projection');
    const child = {
      id: `${session}:${pending.size}:${sequence}`,
      lifecycle: lifecycle.id,
      created: false,
      spawned: false,
      exited: false,
      closed: false,
    };
    children.set(message.process, child);
    pending.add(child);
    append('spawn-start', {
      id: child.id,
      lifecycle: child.lifecycle,
      options: {
        file: options.file,
        args: options.args.slice(),
        cwd: options.cwd,
        envPairs: options.envPairs.slice(),
        environment,
        stdio: stdioReceipt(options.stdio),
        detached: options.detached,
        windowsHide: options.windowsHide,
        windowsVerbatimArguments: options.windowsVerbatimArguments,
      },
    });
    message.process.once('spawn', () => {
      if (child.spawned || !Number.isSafeInteger(message.process.pid))
        return fail('invalid-child-pid');
      child.spawned = true;
      append('child-spawn', { id: child.id, childPid: message.process.pid });
    });
    message.process.once('exit', (code, signal) => {
      child.exited = true;
      append('child-exit', { id: child.id, code, signal });
      if (code !== 0 || signal) fail('child-exit-failed');
    });
    message.process.once('close', (code, signal) => {
      child.closed = true;
      append('child-close', { id: child.id, code, signal });
      if (code !== 0 || signal) fail('child-close-failed');
    });
  } catch {
    fail('unsupported-spawn');
  }
});

diagnostics.channel('tracing:child_process.spawn:end').subscribe((message) => {
  const child = children.get(message.process);
  if (!child || child.created) return fail('unmatched-spawn-creation');
  child.created = true;
  append('spawn-created', { id: child.id });
});
diagnostics.channel('tracing:child_process.spawn:error').subscribe((message) => {
  const child = children.get(message.process);
  append('spawn-error', { id: child?.id ?? null });
  fail('spawn-error');
});
diagnostics.channel('process.execve').subscribe(() => fail('unsupported-execve'));
process.once('exit', (code) => {
  if (
    [...pending].some((child) => !child.created || !child.spawned || !child.exited || !child.closed)
  )
    fail('incomplete-child');
  append('finished', { code, refused });
  fs.closeSync(fd);
});
