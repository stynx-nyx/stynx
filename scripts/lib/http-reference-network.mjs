import { AsyncLocalStorage } from 'node:async_hooks';
import net, * as netNamespace from 'node:net';
import tls, * as tlsNamespace from 'node:tls';
import http, * as httpNamespace from 'node:http';
import https, * as httpsNamespace from 'node:https';
import dns, * as dnsNamespace from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { isDeepStrictEqual, types } from 'node:util';
import { EventEmitter } from 'node:events';
import { httpOriginalScenarioProfile } from './http-original-scenarios.mjs';

// Component observations never authenticate the supervisor's live build or
// resources. The fixed worker/parent must bind this exact closure separately.
const scopes = new WeakMap();
let active;
const require = createRequire(import.meta.url);
const dnsMethods = [
  'lookup',
  'lookupService',
  'resolve',
  'resolve4',
  'resolve6',
  'resolveAny',
  'resolveCaa',
  'resolveCname',
  'resolveMx',
  'resolveNaptr',
  'resolveNs',
  'resolvePtr',
  'resolveSoa',
  'resolveSrv',
  'resolveTlsa',
  'resolveTxt',
  'reverse',
];

function plain(value) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype)
    return false;
  return Reflect.ownKeys(value).every((key) => {
    const row = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && row.enumerable && Object.hasOwn(row, 'value');
  });
}

// Node24.20's actual Agent.createSocket creates this null-prototype data object.
// It is accepted only under the source-bound Smithy/Agent lowering ticket.
function nativeAgentOptions(value) {
  return (
    !!value &&
    !types.isProxy(value) &&
    Object.getPrototypeOf(value) === null &&
    Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    })
  );
}

function refuse(state, reason, boundary = 'scope') {
  state.failure ??= reason;
  if (state.effects.length < state.effectLimit)
    state.effects.push({ sequence: ++state.sequence, boundary, decision: 'REFUSED', reason });
  const error = new Error('Owned reference transport boundary refused');
  error.code = `HTTP_REFERENCE_NETWORK_${reason}`;
  throw error;
}

function stateFor(handle) {
  const state = scopes.get(handle);
  if (!state || state.closed) throw new Error('Unknown or closed reference network scope');
  if (state.failure) refuse(state, state.failure);
  return state;
}

function admitted(state, boundary, destination) {
  if (state.closed) refuse(state, 'CLOSED', boundary);
  if (state.failure) refuse(state, state.failure, boundary);
  if (state.effects.length >= state.effectLimit) refuse(state, 'EFFECT_BOUND', boundary);
  state.effects.push({ sequence: ++state.sequence, boundary, decision: 'FORWARDED', destination });
}

function port(value) {
  if (typeof value === 'string' && /^[1-9][0-9]*$/u.test(value)) value = Number(value);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : undefined;
}

function destination(state, host, value, boundary) {
  const number = port(value);
  if (host !== '127.0.0.1' || number === undefined) refuse(state, 'DESTINATION', boundary);
  const kind =
    number === state.postgresPort
      ? 'owned-postgres'
      : number === state.redisPort
        ? 'owned-redis'
        : number === state.listener?.port
          ? 'owned-listener'
          : number === state.objectStorePort && state.sdkContext.getStore()?.networkAdmitted
            ? 'owned-object-store'
            : undefined;
  if (!kind) refuse(state, 'DESTINATION', boundary);
  return { host, port: number, kind };
}

function connectArguments(state, args, boundary, lowering) {
  // Node's own createConnection lowering may pass its normalized argument array
  // to Socket.connect. It is admitted only inside the synchronous invocation of
  // the exact captured builtin, with the independently admitted outer target.
  if (lowering && args.length === 1 && Array.isArray(args[0]) && !types.isProxy(args[0]))
    args = args[0];
  let host, value;
  if (
    args.length >= 1 &&
    args.length <= 2 &&
    (plain(args[0]) ||
      (lowering && state.sdkContext.getStore()?.networkAdmitted && nativeAgentOptions(args[0])))
  ) {
    const options = args[0];
    if (args.length === 2 && typeof args[1] !== 'function') refuse(state, 'OVERLOAD', boundary);
    const allowed = new Set([
      'host',
      'port',
      'family',
      'noDelay',
      'keepAlive',
      'keepAliveInitialDelay',
      'timeout',
      'onread',
      'readable',
      'writable',
      'tls',
    ]);
    if (!lowering && Object.keys(options).some((key) => !allowed.has(key)))
      refuse(state, 'CONNECT_OPTIONS', boundary);
    // No caller-supplied resolver, stream, local bind, proxy or Unix socket.
    for (const key of [
      'lookup',
      'socket',
      'socketPath',
      'localAddress',
      'localPort',
      'createConnection',
    ])
      if (options[key] !== undefined) refuse(state, 'CONNECT_OPTIONS', boundary);
    if (options.path !== undefined && options.path !== null)
      refuse(state, 'CONNECT_OPTIONS', boundary);
    for (const key of ['noDelay', 'keepAlive', 'readable', 'writable'])
      if (options[key] !== undefined && typeof options[key] !== 'boolean')
        refuse(state, 'CONNECT_OPTIONS', boundary);
    if (
      (options.family !== undefined && options.family !== 4) ||
      (options.keepAliveInitialDelay !== undefined &&
        (!Number.isInteger(options.keepAliveInitialDelay) || options.keepAliveInitialDelay < 0)) ||
      options.timeout !== undefined ||
      options.onread !== undefined ||
      (options.tls !== undefined && options.tls !== false)
    )
      refuse(state, 'CONNECT_OPTIONS', boundary);
    host = options.host ?? options.hostname;
    if (
      options.host !== undefined &&
      options.hostname !== undefined &&
      options.host !== options.hostname
    )
      refuse(state, 'DESTINATION', boundary);
    value = options.port;
  } else if (
    args.length >= 2 &&
    args.length <= 3 &&
    (typeof args[0] === 'number' || typeof args[0] === 'string') &&
    typeof args[1] === 'string' &&
    (args.length === 2 || typeof args[2] === 'function')
  ) {
    [value, host] = args;
  } else refuse(state, 'OVERLOAD', boundary);
  const target = destination(state, host, value, boundary);
  if (lowering && !isDeepStrictEqual(target, lowering)) refuse(state, 'BUILTIN_LOWERING', boundary);
  return target;
}

function normalizedSocketArguments(state, args, ticket) {
  const boundary = 'net.Socket.connect';
  if (
    !ticket ||
    ticket.kind !== 'net-connect' ||
    ticket.used ||
    args.length !== 1 ||
    !Array.isArray(args[0]) ||
    types.isProxy(args[0]) ||
    Object.getPrototypeOf(args[0]) !== Array.prototype ||
    args[0].length !== 2
  )
    refuse(state, 'NORMALIZED_CONNECT', boundary);
  const normalized = args[0];
  const keys = Reflect.ownKeys(normalized),
    symbols = Object.getOwnPropertySymbols(normalized);
  if (
    symbols.length !== 1 ||
    keys.length !== 4 ||
    !isDeepStrictEqual(keys.slice(0, 3), ['0', '1', 'length']) ||
    keys[3] !== symbols[0]
  )
    refuse(state, 'NORMALIZED_CONNECT', boundary);
  const descriptors = Object.getOwnPropertyDescriptors(normalized);
  for (const key of ['0', '1', symbols[0]]) {
    const row = descriptors[key];
    if (
      !row ||
      !Object.hasOwn(row, 'value') ||
      !row.writable ||
      !row.enumerable ||
      !row.configurable
    )
      refuse(state, 'NORMALIZED_CONNECT_DESCRIPTOR', boundary);
  }
  const length = descriptors.length;
  if (
    !length ||
    length.value !== 2 ||
    !length.writable ||
    length.enumerable ||
    length.configurable ||
    descriptors[symbols[0]].value !== true ||
    descriptors['1'].value !== ticket.callback
  )
    refuse(state, 'NORMALIZED_CONNECT_IDENTITY', boundary);
  const options = descriptors['0'].value;
  if (ticket.form === 'object') {
    if (
      options !== ticket.options ||
      !isDeepStrictEqual(Object.getOwnPropertyDescriptors(options), ticket.optionsDescriptors)
    )
      refuse(state, 'NORMALIZED_CONNECT_IDENTITY', boundary);
  } else if (ticket.form === 'primitive') {
    // normalizeArgs creates this options object inside the captured original
    // builtin. Raw port spelling is retained; numeric equivalence is insufficient.
    if (
      !plain(options) ||
      Reflect.ownKeys(options).length !== 2 ||
      !Object.hasOwn(options, 'port') ||
      !Object.hasOwn(options, 'host') ||
      options.port !== ticket.originalPort ||
      options.host !== ticket.originalHost
    )
      refuse(state, 'NORMALIZED_CONNECT_PRIMITIVE', boundary);
    ticket.options = options;
    ticket.optionsDescriptors = Object.getOwnPropertyDescriptors(options);
  } else refuse(state, 'NORMALIZED_CONNECT_IDENTITY', boundary);
  // The symbol is an observed member of the actual one-use builtin-produced
  // array, never a name/description-based brand or caller-issued capability.
  ticket.used = true;
  ticket.normalized = normalized;
  ticket.marker = symbols[0];
  return ticket.callback === null ? [ticket.options] : [ticket.options, ticket.callback];
}

function httpArguments(state, args, boundary) {
  if (
    args.length < 1 ||
    args.length > 2 ||
    !plain(args[0]) ||
    (args.length === 2 && typeof args[1] !== 'function')
  )
    refuse(state, 'OVERLOAD', boundary);
  const options = args[0];
  const ticket = state.sdkContext.getStore();
  if (ticket?.kind === 'smithy-http-request') {
    const row = ticket.row;
    const request = ticket.request;
    const config = row.handler.config;
    const query = request.query ? row.buildQueryString(request.query) : '';
    if (
      ticket.used ||
      Object.keys(options).sort().join(',') !== 'agent,auth,headers,host,method,path,port' ||
      options.headers !== request.headers ||
      options.host !== request.hostname ||
      options.method !== request.method ||
      options.port !== request.port ||
      options.auth !== undefined ||
      options.path !== request.path + (query ? `?${query}` : '') ||
      !config ||
      options.agent !== config.httpAgent ||
      !(options.agent instanceof http.Agent) ||
      Object.getPrototypeOf(options.agent) !== http.Agent.prototype ||
      config.httpsAgent !== undefined ||
      request.headers.expect !== undefined ||
      request.headers.Expect !== undefined
    )
      refuse(state, 'SDK_HTTP_IDENTITY', boundary);
    bindSdkAgent(state, row, options.agent);
    ticket.used = true;
    ticket.networkAdmitted = true;
    return destination(state, options.host, options.port, boundary);
  }
  const allowed = new Set(['host', 'port', 'method', 'path', 'agent']);
  if (
    Object.keys(options).some((key) => !allowed.has(key)) ||
    options.method !== 'GET' ||
    options.agent !== false ||
    !['/healthz', '/profile'].includes(options.path)
  )
    refuse(state, 'HTTP_OPTIONS', boundary);
  const target = destination(state, options.host, options.port, boundary);
  if (target.kind !== 'owned-listener') refuse(state, 'HTTP_DESTINATION', boundary);
  return target;
}

function verifyDescriptors(state) {
  for (const row of state.sdkPatches) {
    if (
      !isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.installed) ||
      !isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.owner, row.key), row.ownerDescriptor)
    )
      refuse(state, 'SDK_DESCRIPTOR_DRIFT');
  }
  for (const row of state.sdkClients) {
    if (
      row.client.config !== row.config ||
      row.config.requestHandler !== row.handler ||
      Object.getPrototypeOf(row.client) !== row.clientConstructor.prototype ||
      Object.getPrototypeOf(row.handler) !== row.handlerConstructor.prototype ||
      (row.agent && row.handler.config?.httpAgent !== row.agent)
    )
      refuse(state, 'SDK_CLIENT_DRIFT');
  }
  if (state.listenGuard) {
    for (const constructor of [http.Server, https.Server])
      if (constructor.prototype.listen !== state.listenGuard) refuse(state, 'LISTEN_ALIAS');
    if (state.server && state.server.listen !== state.listenGuard) refuse(state, 'LISTEN_ALIAS');
  }
  for (const row of state.descriptors)
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.installed))
      refuse(state, 'DESCRIPTOR_DRIFT', row.boundary);
  for (const [name, object, namespace] of state.aliases) {
    if (require(`node:${name}`) !== object || require(name) !== object)
      refuse(state, 'BUILTIN_ALIAS');
    for (const row of state.descriptors.filter((item) => item.object === object))
      if (namespace[row.key] !== row.installed.value) refuse(state, 'ESM_ALIAS', row.boundary);
  }
}

/** Internal fixed-worker component; scalar endpoints grant no resource custody. */
export function installOwnedReferenceNetworkScope(binding) {
  if (arguments.length !== 1) throw new Error('Invalid fixed reference network binding');
  return installFixedReferenceNetworkScope(binding, null);
}

/** Separate source-owned storage capacity; this does not admit a workload. */
export function installOwnedOriginalReferenceNetworkScope(binding, selector) {
  if (arguments.length !== 2) throw new Error('Invalid fixed original network binding');
  const profile = httpOriginalScenarioProfile(selector);
  return installFixedReferenceNetworkScope(binding, {
    scenarioId: profile.scenarioId,
    profileId: profile.profileId,
    maximumRetainedEffects: 100_000,
  });
}

function installFixedReferenceNetworkScope(binding, originalScenarioCapacity) {
  if (
    process.versions.node !== '24.20.0' ||
    active ||
    !plain(binding) ||
    !['postgresPort,redisPort', 'objectStorePort,postgresPort,redisPort'].includes(
      Object.keys(binding).sort().join(','),
    ) ||
    (Object.hasOwn(binding, 'objectStorePort') &&
      (port(binding.objectStorePort) !== binding.objectStorePort ||
        [binding.postgresPort, binding.redisPort].includes(binding.objectStorePort))) ||
    port(binding.postgresPort) !== binding.postgresPort ||
    port(binding.redisPort) !== binding.redisPort ||
    binding.postgresPort === binding.redisPort
  )
    throw new Error('Invalid fixed reference network binding');
  const state = {
    originalScenarioCapacity,
    effectLimit: originalScenarioCapacity?.maximumRetainedEffects ?? 10_000,
    postgresPort: binding.postgresPort,
    redisPort: binding.redisPort,
    objectStorePort: binding.objectStorePort,
    sdkContext: new AsyncLocalStorage(),
    sdkClients: [],
    sdkPatches: [],
    descriptors: [],
    effects: [],
    sequence: 0,
    sockets: new Map(),
    server: undefined,
    listener: undefined,
    listenerClosed: false,
    listenAdmission: undefined,
    listenTicket: undefined,
    lowering: undefined,
    failure: undefined,
    closed: false,
    aliases: [
      ['net', net, netNamespace],
      ['tls', tls, tlsNamespace],
      ['http', http, httpNamespace],
      ['https', https, httpsNamespace],
      ['dns', dns, dnsNamespace],
    ],
  };
  const handle = Object.freeze(Object.create(null));
  scopes.set(handle, state);
  active = state;
  const wrap = (object, key, boundary, body, shared) => {
    const original = Object.getOwnPropertyDescriptor(object, key);
    if (
      !original ||
      !Object.hasOwn(original, 'value') ||
      typeof original.value !== 'function' ||
      !original.configurable ||
      !original.writable
    )
      refuse(state, 'DESCRIPTOR', boundary);
    const fn =
      shared ??
      function (...args) {
        verifyDescriptors(state);
        return body.call(this, original.value, args);
      };
    const installed = { ...original, value: fn };
    Object.defineProperty(object, key, installed);
    state.descriptors.push({ object, key, original, installed, boundary });
    return fn;
  };
  // Captured builtin cleanup/error operations never confer DNS admission.
  const originalClose = net.Server.prototype.close;
  const originalEmit = EventEmitter.prototype.emit;
  const asyncListenFailure = (ticket, reason) => {
    state.failure ??= reason;
    ticket.callbackOutcome = 'REFUSED';
    if (state.effects.length < state.effectLimit)
      state.effects.push({
        sequence: ++state.sequence,
        boundary: 'dns.lookup.numeric-listen-lowering',
        decision: 'REFUSED',
        reason,
      });
    // Never throw from our asynchronous validation continuation. Notify the
    // retained server's real waiters and initiate only its owned close path.
    // After scope close a late callback is suppressed, never forwarded to bind.
    if (!state.closed && state.server === ticket.server) {
      const error = new Error('Owned numeric listen continuation refused');
      error.code = 'HTTP_REFERENCE_NETWORK_NUMERIC_LISTEN_CONTINUATION';
      try {
        Reflect.apply(originalEmit, ticket.server, ['error', error]);
      } catch {
        /* sticky */
      }
      try {
        Reflect.apply(originalClose, ticket.server, [() => {}]);
      } catch {
        /* retained */
      }
    }
  };
  try {
    const retainSocket = (socket) => {
      if (state.sockets.has(socket)) return;
      const row = { socket, closed: false };
      state.sockets.set(socket, row);
      socket.once('close', () => {
        row.closed = true;
      });
    };
    const connect = function (original, args) {
      const boundary = 'net.createConnection/connect';
      const prior = state.lowering;
      if (prior?.kind === 'net-connect') refuse(state, 'CONNECT_REENTRANCY', boundary);
      const target = connectArguments(state, args, boundary, prior);
      admitted(state, boundary, target);
      const options = plain(args[0]) ? args[0] : undefined;
      const callback = typeof args.at(-1) === 'function' ? args.at(-1) : null;
      const ticket = {
        kind: 'net-connect',
        form: options ? 'object' : 'primitive',
        target,
        options,
        originalPort: options ? undefined : args[0],
        originalHost: options ? undefined : args[1],
        callback,
        optionsDescriptors: options && Object.getOwnPropertyDescriptors(options),
        used: false,
      };
      state.lowering = ticket;
      try {
        const result = Reflect.apply(original, this, args);
        if (!ticket.used || result !== ticket.socket || !(result instanceof net.Socket))
          refuse(state, 'CONNECT_RETURN_IDENTITY', boundary);
        return result;
      } catch (error) {
        state.failure ??= 'CONNECT_THROWN';
        throw error;
      } finally {
        state.lowering = prior;
      }
    };
    const originalConnect = net.connect;
    if (net.createConnection !== originalConnect) refuse(state, 'NET_ALIAS');
    const sharedConnect = wrap(net, 'connect', 'net.connect', connect);
    wrap(net, 'createConnection', 'net.createConnection', connect, sharedConnect);
    wrap(net.Socket.prototype, 'connect', 'net.Socket.connect', function (original, args) {
      const ticket = state.lowering;
      // Every entry under this ticket must be its one native-normalized call.
      // A second direct overload cannot bypass consumption or replace ownership.
      if (ticket?.kind === 'net-connect' && (ticket.used || !Array.isArray(args[0])))
        refuse(state, 'NORMALIZED_CONNECT', 'net.Socket.connect');
      const validationArgs = Array.isArray(args[0])
        ? normalizedSocketArguments(state, args, ticket)
        : args;
      if (ticket?.kind === 'net-connect' && !ticket.used)
        refuse(state, 'NORMALIZED_CONNECT_MISSING', 'net.Socket.connect');
      const target = connectArguments(
        state,
        validationArgs,
        'net.Socket.connect',
        ticket?.kind === 'net-connect' ? ticket.target : ticket,
      );
      if (!(this instanceof net.Socket)) refuse(state, 'SOCKET_IDENTITY');
      if (ticket?.kind === 'net-connect') ticket.socket = this;
      admitted(state, 'net.Socket.connect', target);
      retainSocket(this);
      try {
        const result = Reflect.apply(original, this, args);
        if (result !== this) refuse(state, 'SOCKET_RETURN_IDENTITY');
        return result;
      } catch (error) {
        state.failure ??= 'SOCKET_CONNECT_THROWN';
        throw error;
      }
    });
    state.listenGuard = wrap(
      net.Server.prototype,
      'listen',
      'net.Server.listen',
      function (original, args) {
        if (
          !(this instanceof net.Server) ||
          state.server ||
          args.length < 2 ||
          args.length > 3 ||
          args[0] !== 0 ||
          args[1] !== '127.0.0.1' ||
          (args.length === 3 && typeof args[2] !== 'function')
        )
          refuse(state, 'LISTEN');
        admitted(state, 'net.Server.listen', {
          host: '127.0.0.1',
          port: 0,
          kind: 'owned-listener-pending',
        });
        state.server = this;
        this.on('error', () => {
          state.failure ??= 'SERVER_ERROR';
        });
        this.on('connection', (socket) => {
          if (!(socket instanceof net.Socket)) refuse(state, 'SOCKET_IDENTITY');
          retainSocket(socket);
        });
        this.once('close', () => {
          state.listenerClosed = true;
        });
        if (state.listenAdmission || state.listenTicket) refuse(state, 'LISTEN_REENTRANCY');
        const ticket = {
          server: this,
          lookupStarted: false,
          callbackCount: 0,
          callbackOutcome: 'PENDING',
          listenReturned: false,
        };
        state.listenTicket = ticket;
        const previous = state.listenAdmission;
        state.listenAdmission = ticket;
        try {
          const result = Reflect.apply(original, this, args);
          if (result !== this || !ticket.lookupStarted) refuse(state, 'LISTENER_IDENTITY');
          ticket.listenReturned = true;
          return result;
        } catch (error) {
          state.failure ??= 'LISTEN_THROWN';
          throw error;
        } finally {
          state.listenAdmission = previous;
        }
      },
    );
    for (const constructor of [http.Server, https.Server])
      if (constructor.prototype.listen !== net.Server.prototype.listen)
        refuse(state, 'LISTEN_ALIAS');
    for (const key of ['request', 'get'])
      wrap(http, key, `http.${key}`, function (original, args) {
        const target = httpArguments(state, args, `http.${key}`);
        admitted(state, `http.${key}`, target);
        const prior = state.lowering;
        state.lowering = target;
        try {
          return Reflect.apply(original, this, args);
        } finally {
          state.lowering = prior;
        }
      });
    // Node24.20 net.lookupAndListen lowers numeric listen through public
    // dns.lookup; its numeric isIP path schedules the exact one-address result
    // without a DNS query. The synchronous ticket cannot escape this call.
    wrap(dns, 'lookup', 'dns.lookup', function (original, args) {
      const ticket = state.listenAdmission;
      if (
        !ticket ||
        ticket !== state.listenTicket ||
        ticket.server !== state.server ||
        ticket.lookupStarted ||
        state.closed ||
        args.length !== 3 ||
        args[0] !== '127.0.0.1' ||
        !plain(args[1]) ||
        Object.keys(args[1]).join(',') !== 'all' ||
        args[1].all !== true ||
        typeof args[2] !== 'function' ||
        types.isProxy(args[2])
      )
        refuse(state, 'UNOWNED_TRANSPORT', 'dns.lookup');
      ticket.lookupStarted = true;
      admitted(state, 'dns.lookup.numeric-listen-lowering', {
        host: '127.0.0.1',
        port: 0,
        kind: 'owned-listener-pending',
      });
      const callback = args[2];
      const observedCallback = function (...values) {
        ticket.callbackCount++;
        try {
          if (
            state.closed ||
            state.failure ||
            state.listenAdmission !== undefined ||
            !ticket.listenReturned ||
            state.listenTicket !== ticket ||
            state.server !== ticket.server ||
            ticket.callbackCount !== 1 ||
            values.length !== 2 ||
            values[0] !== null ||
            !Array.isArray(values[1]) ||
            types.isProxy(values[1]) ||
            Object.getPrototypeOf(values[1]) !== Array.prototype ||
            values[1].length !== 1 ||
            !isDeepStrictEqual(Reflect.ownKeys(values[1]), ['0', 'length'])
          )
            throw new Error('Invalid numeric continuation');
          const entryDescriptor = Object.getOwnPropertyDescriptor(values[1], '0');
          const entry =
            entryDescriptor && Object.hasOwn(entryDescriptor, 'value') && entryDescriptor.value;
          if (
            !plain(entry) ||
            Object.keys(entry).sort().join(',') !== 'address,family' ||
            entry.address !== '127.0.0.1' ||
            entry.family !== 4
          )
            throw new Error('Invalid numeric continuation');
          verifyDescriptors(state);
          ticket.callbackOutcome = 'FORWARDED';
          // Preserve original scheduling, actual receiver and both native args.
          return Reflect.apply(callback, this, values);
        } catch {
          asyncListenFailure(ticket, 'NUMERIC_LISTEN_CONTINUATION');
        }
      };
      try {
        return Reflect.apply(original, this, [args[0], args[1], observedCallback]);
      } catch (error) {
        state.failure ??= 'NUMERIC_LISTEN_LOOKUP_THROWN';
        throw error;
      }
    });
    for (const [object, names, prefix] of [
      [tls, ['connect'], 'tls'],
      [https, ['request', 'get'], 'https'],
      [dns, dnsMethods, 'dns'],
      [dnsPromises, dnsMethods, 'dns.promises'],
      [dns.Resolver.prototype, dnsMethods, 'dns.Resolver'],
      [dnsPromises.Resolver.prototype, dnsMethods, 'dns.promises.Resolver'],
    ]) {
      for (const key of names) {
        if (object === dns && key === 'lookup') continue;
        if (typeof object[key] !== 'function') continue;
        let owner = object;
        while (!Object.hasOwn(owner, key)) owner = Object.getPrototypeOf(owner);
        if (state.descriptors.some((row) => row.object === owner && row.key === key)) continue;
        wrap(owner, key, `${prefix}.${key}`, function () {
          refuse(state, 'UNOWNED_TRANSPORT', `${prefix}.${key}`);
        });
      }
    }
    wrap(globalThis, 'fetch', 'global.fetch', function () {
      refuse(state, 'UNOWNED_TRANSPORT', 'global.fetch');
    });
    syncBuiltinESMExports();
    verifyDescriptors(state);
    return handle;
  } catch (error) {
    state.closed = true;
    for (const row of state.descriptors.slice().reverse())
      if (isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.installed))
        Object.defineProperty(row.object, row.key, row.original);
    syncBuiltinESMExports();
    active = undefined;
    throw error;
  }
}

function sdkPatch(state, object, key, make) {
  if (!object || types.isProxy(object)) refuse(state, 'SDK_OBJECT');
  const original = Object.getOwnPropertyDescriptor(object, key);
  let owner = object;
  while (owner && !Object.hasOwn(owner, key)) owner = Object.getPrototypeOf(owner);
  const ownerDescriptor = owner && Object.getOwnPropertyDescriptor(owner, key);
  if (
    original ||
    !ownerDescriptor ||
    !Object.hasOwn(ownerDescriptor, 'value') ||
    typeof ownerDescriptor.value !== 'function' ||
    !Object.isExtensible(object)
  )
    refuse(state, 'SDK_METHOD');
  const installed = {
    value: make(ownerDescriptor.value),
    configurable: true,
    enumerable: false,
    writable: true,
  };
  Object.defineProperty(object, key, installed);
  state.sdkPatches.push({ object, key, original, owner, ownerDescriptor, installed });
}

function bindSdkAgent(state, row, agent) {
  if (row.agent) {
    if (row.agent !== agent) refuse(state, 'SDK_AGENT_DRIFT');
    return;
  }
  if (
    types.isProxy(agent) ||
    agent.keepAlive !== true ||
    agent.maxSockets !== 50 ||
    Object.values(agent.sockets).flat().length ||
    Object.values(agent.freeSockets).flat().length ||
    Object.values(agent.requests).flat().length
  )
    refuse(state, 'SDK_AGENT_INITIAL_STATE');
  row.agent = agent;
  sdkPatch(
    state,
    agent,
    'createConnection',
    (original) =>
      function (...args) {
        verifyDescriptors(state);
        const sdk = state.sdkContext.getStore();
        if (
          this !== agent ||
          sdk?.row !== row ||
          !sdk.used ||
          !sdk.networkAdmitted ||
          args.length < 1 ||
          args.length > 2 ||
          !nativeAgentOptions(args[0]) ||
          (args.length === 2 && typeof args[1] !== 'function') ||
          state.lowering?.kind === 'net-connect'
        )
          refuse(state, 'SDK_AGENT_CALL');
        const target = connectArguments(state, args, 'sdk.Agent.createConnection', {
          host: '127.0.0.1',
          port: state.objectStorePort,
          kind: 'owned-object-store',
        });
        const previous = state.lowering;
        const ticket = {
          kind: 'net-connect',
          form: 'object',
          target,
          options: args[0],
          callback: typeof args[1] === 'function' ? args[1] : null,
          optionsDescriptors: Object.getOwnPropertyDescriptors(args[0]),
          used: false,
        };
        state.lowering = ticket;
        try {
          admitted(state, 'sdk.Agent.createConnection', target);
          const result = Reflect.apply(original, this, args);
          if (!ticket.used || result !== ticket.socket || !(result instanceof net.Socket))
            refuse(state, 'SDK_AGENT_RETURN');
          return result;
        } finally {
          state.lowering = previous;
        }
      },
  );
}

/** Actual source-bound provider instances only; the fixed lifecycle owns this call. */
export function bindOwnedReferenceObjectStoreClient(handle, binding) {
  if (arguments.length !== 2) throw new Error('Invalid actual SDK client binding');
  const state = stateFor(handle);
  verifyDescriptors(state);
  if (
    !plain(binding) ||
    Object.keys(binding).sort().join(',') !==
      'bucket,buildQueryString,client,clientConstructor,handlerConstructor,kind,requestConstructor,sourceOrigins' ||
    !state.objectStorePort ||
    !['storage', 'privacy'].includes(binding.kind) ||
    typeof binding.bucket !== 'string' ||
    !/^[a-z0-9][a-z0-9-]+$/u.test(binding.bucket) ||
    typeof binding.clientConstructor !== 'function' ||
    typeof binding.handlerConstructor !== 'function' ||
    typeof binding.requestConstructor !== 'function' ||
    typeof binding.buildQueryString !== 'function' ||
    state.sdkClients.some((row) => row.kind === binding.kind || row.client === binding.client)
  )
    refuse(state, 'SDK_BINDING');
  const client = binding.client;
  const config = client?.config;
  const handler = config?.requestHandler;
  if (
    types.isProxy(client) ||
    types.isProxy(handler) ||
    !config ||
    Object.getPrototypeOf(client) !== binding.clientConstructor.prototype ||
    Object.getPrototypeOf(handler) !== binding.handlerConstructor.prototype ||
    handler.config ||
    !handler.configProvider ||
    typeof handler.configProvider.then !== 'function'
  )
    refuse(state, 'SDK_CONSTRUCTOR');
  const row = {
    ...binding,
    config,
    handler,
    sendCalls: 0,
    handlerCalls: 0,
    settledHandlerCalls: 0,
    destroyCalls: 0,
    handlerDestroyCalls: 0,
    destroyed: false,
    handlerDestroyed: false,
    destroying: false,
  };
  state.sdkClients.push(row);
  sdkPatch(
    state,
    client,
    'destroy',
    (original) =>
      function (...args) {
        verifyDescriptors(state);
        if (
          this !== client ||
          args.length ||
          row.destroying ||
          row.handlerCalls !== row.settledHandlerCalls
        )
          refuse(state, 'SDK_DESTROY_CALL');
        row.destroyCalls++;
        row.destroying = true;
        try {
          const result = Reflect.apply(original, this, args);
          if (result !== undefined || !row.handlerDestroyed) refuse(state, 'SDK_DESTROY_RETURN');
          row.destroyed = true;
          return result;
        } finally {
          row.destroying = false;
        }
      },
  );
  sdkPatch(
    state,
    handler,
    'destroy',
    (original) =>
      function (...args) {
        verifyDescriptors(state);
        if (this !== handler || args.length || !row.destroying)
          refuse(state, 'SDK_HANDLER_DESTROY_CALL');
        row.handlerDestroyCalls++;
        const result = Reflect.apply(original, this, args);
        if (result !== undefined) refuse(state, 'SDK_HANDLER_DESTROY_RETURN');
        row.handlerDestroyed = true;
        return result;
      },
  );
  sdkPatch(
    state,
    client,
    'send',
    (original) =>
      function (...args) {
        verifyDescriptors(state);
        if (
          this !== client ||
          row.destroyed ||
          args.length < 1 ||
          args.length > 2 ||
          !args[0] ||
          types.isProxy(args[0]) ||
          (args.length === 2 && (!plain(args[1]) || Object.keys(args[1]).length !== 0))
        )
          refuse(state, 'SDK_SEND');
        row.sendCalls++;
        return state.sdkContext.run({ kind: 'aws-client-send', row }, () =>
          Reflect.apply(original, this, args),
        );
      },
  );
  sdkPatch(
    state,
    handler,
    'handle',
    (original) =>
      function (...args) {
        verifyDescriptors(state);
        const parent = state.sdkContext.getStore();
        const request = args[0];
        if (
          this !== handler ||
          row.destroyed ||
          parent?.kind !== 'aws-client-send' ||
          parent.row !== row ||
          args.length < 1 ||
          args.length > 2 ||
          !request ||
          types.isProxy(request) ||
          Object.getPrototypeOf(request) !== binding.requestConstructor.prototype ||
          request.protocol !== 'http:' ||
          request.hostname !== '127.0.0.1' ||
          request.port !== state.objectStorePort ||
          !['GET', 'PUT', 'HEAD', 'DELETE'].includes(request.method) ||
          typeof request.path !== 'string' ||
          !(request.path === `/${row.bucket}` || request.path.startsWith(`/${row.bucket}/`)) ||
          request.username != null ||
          request.password != null ||
          request.fragment ||
          !plain(request.headers) ||
          typeof request.headers.authorization !== 'string' ||
          !request.headers.authorization.startsWith('AWS4-HMAC-SHA256 ') ||
          (request.query !== undefined && !plain(request.query))
        )
          refuse(state, 'SDK_HANDLER_REQUEST');
        row.handlerCalls++;
        const ticket = {
          kind: 'smithy-http-request',
          row,
          request,
          used: false,
          networkAdmitted: false,
        };
        const result = state.sdkContext.run(ticket, () => Reflect.apply(original, this, args));
        if (!result || typeof result.then !== 'function') refuse(state, 'SDK_HANDLER_RETURN');
        result.then(
          () => {
            row.settledHandlerCalls++;
            if (!ticket.used) state.failure ??= 'SDK_HTTP_MISSING';
          },
          () => {
            row.settledHandlerCalls++;
          },
        );
        return result;
      },
  );
  return {
    kind: row.kind,
    actualClientRetained: true,
    actualHandlerRetained: true,
    sourceOrigins: structuredClone(binding.sourceOrigins),
    parentCorroborationRequired: true,
    readinessPromoting: false,
  };
}

/** Only the actual server observed at guarded listen can add a request target. */
export function bindOwnedReferenceListener(handle, server) {
  if (arguments.length !== 2) throw new Error('Invalid owned listener binding');
  const state = stateFor(handle);
  verifyDescriptors(state);
  if (
    server !== state.server ||
    !(server instanceof net.Server) ||
    !server.listening ||
    state.listenerClosed
  )
    refuse(state, 'LISTENER_IDENTITY');
  const address = server.address();
  if (
    !address ||
    typeof address === 'string' ||
    address.address !== '127.0.0.1' ||
    address.family !== 'IPv4' ||
    port(address.port) !== address.port ||
    [state.postgresPort, state.redisPort, state.objectStorePort].includes(address.port)
  )
    refuse(state, 'LISTENER_ADDRESS');
  const target = { host: address.address, port: address.port, kind: 'owned-listener' };
  if (state.listener && !isDeepStrictEqual(state.listener, target)) refuse(state, 'LISTENER_DRIFT');
  state.listener = target;
  return structuredClone(target);
}

export function observeOwnedReferenceNetwork(handle) {
  if (arguments.length !== 1) throw new Error('Invalid network observation');
  const state = stateFor(handle);
  verifyDescriptors(state);
  if (state.listener && !state.listenerClosed) bindOwnedReferenceListener(handle, state.server);
  return structuredClone({
    schemaVersion: 1,
    scope: 'reference-owned-loopback-transport-component',
    ...(state.originalScenarioCapacity
      ? { originalScenarioCapacity: state.originalScenarioCapacity }
      : {}),
    effects: state.effects,
    listener: state.listener ?? null,
    actualSdkClients: state.sdkClients.map((row) => ({
      kind: row.kind,
      sendCalls: row.sendCalls,
      handlerCalls: row.handlerCalls,
      settledHandlerCalls: row.settledHandlerCalls,
      nativeAgentObserved: !!row.agent,
      activeHandlerCalls: row.handlerCalls - row.settledHandlerCalls,
      actualClientDestroyCalls: row.destroyCalls,
      actualHandlerDestroyCalls: row.handlerDestroyCalls,
      actualClientDestroyReturned: row.destroyed,
      actualHandlerDestroyReturned: row.handlerDestroyed,
      agentOpenSocketCount: row.agent ? Object.values(row.agent.sockets).flat().length : 0,
      agentFreeSocketCount: row.agent ? Object.values(row.agent.freeSockets).flat().length : 0,
      agentQueuedRequestCount: row.agent ? Object.values(row.agent.requests).flat().length : 0,
      sourceOrigins: row.sourceOrigins,
    })),
    retainedSocketCount: state.sockets.size,
    openSocketCount: [...state.sockets.values()].filter((row) => !row.closed).length,
    destroyRequestedSocketCount: [...state.sockets.values()].filter((row) => row.socket.destroyed)
      .length,
    observedClosedSocketCount: [...state.sockets.values()].filter((row) => row.closed).length,
    listenerClosed: state.listenerClosed,
    numericListenLowering: state.listenTicket
      ? {
          lookupStarted: state.listenTicket.lookupStarted,
          callbackCount: state.listenTicket.callbackCount,
          callbackOutcome: state.listenTicket.callbackOutcome,
          synchronousAdmissionClosed: state.listenAdmission === undefined,
        }
      : null,
    parentCorroborationRequired: true,
    actualTransportSourceAdmission: 'PENDING_INDEPENDENT_INSPECTOR',
    capturedNativeUndiciTransportCompleteness: 'UNVERIFIED',
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
}

/** Retain already captured failure rows without reopening a refused capability.
 * The fixed original worker must durably retain these bytes before it exits.
 * This is neither a cleanup receipt nor complete transport/execution evidence.
 */
export function snapshotOwnedOriginalReferenceNetworkFailure(handle) {
  if (arguments.length !== 1) throw new Error('Invalid original network failure snapshot');
  const state = scopes.get(handle);
  if (!state?.originalScenarioCapacity || !state.failure)
    throw new Error('No actual original network failure is retained');
  return structuredClone({
    schemaVersion: 1,
    scope: 'original-owned-network-failure-diagnostic',
    originalScenarioCapacity: state.originalScenarioCapacity,
    failure: state.failure,
    capturedEffects: state.effects.length,
    effects: state.effects,
    scopeClosed: state.closed,
    cleanupComplete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
}

/** Irreversible close precedes restoration even on a sticky refusal. */
export function closeOwnedReferenceNetworkScope(handle) {
  if (arguments.length !== 1) throw new Error('Invalid network scope close');
  const state = scopes.get(handle);
  if (!state || state.closed) throw new Error('Unknown or closed reference network scope');
  try {
    verifyDescriptors(state);
    if (
      state.sdkClients.some(
        (row) =>
          !row.destroyed ||
          !row.handlerDestroyed ||
          row.destroying ||
          row.handlerCalls !== row.settledHandlerCalls ||
          (row.agent &&
            [row.agent.sockets, row.agent.freeSockets, row.agent.requests].some(
              (table) => Object.values(table).flat().length !== 0,
            )),
      ) ||
      state.listenAdmission !== undefined ||
      (state.listenTicket &&
        (state.listenTicket.callbackCount !== 1 ||
          state.listenTicket.callbackOutcome !== 'FORWARDED')) ||
      [...state.sockets.values()].some((row) => !row.closed || !row.socket.destroyed) ||
      (state.server && (!state.listenerClosed || state.server.listening))
    )
      refuse(state, 'RESOURCE_REMAINS');
  } catch {
    state.failure ??= 'FINAL_CHECK';
  }
  state.closed = true;
  for (const row of state.sdkPatches.slice().reverse()) {
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.installed)) {
      state.failure ??= 'SDK_RESTORATION_DRIFT';
      continue;
    }
    if (row.original) Object.defineProperty(row.object, row.key, row.original);
    else delete row.object[row.key];
  }
  state.sdkContext.disable();
  for (const row of state.descriptors.slice().reverse()) {
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.installed)) {
      state.failure ??= 'DESCRIPTOR_DRIFT';
      continue;
    }
    Object.defineProperty(row.object, row.key, row.original);
  }
  syncBuiltinESMExports();
  for (const row of state.descriptors)
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.original))
      state.failure ??= 'RESTORATION_DRIFT';
  for (const [name, object, namespace] of state.aliases) {
    if (require(`node:${name}`) !== object || require(name) !== object)
      state.failure ??= 'RESTORATION_ALIAS';
    for (const row of state.descriptors.filter((item) => item.object === object))
      if (namespace[row.key] !== row.original.value) state.failure ??= 'RESTORATION_ALIAS';
  }
  active = undefined;
  if (state.failure) {
    const error = new Error('Owned reference transport scope did not close cleanly');
    error.code = `HTTP_REFERENCE_NETWORK_${state.failure}`;
    throw error;
  }
  return { closed: true, parentCorroborationRequired: true, readinessPromoting: false };
}
