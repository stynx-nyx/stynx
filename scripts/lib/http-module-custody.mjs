import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire, isBuiltin, registerHooks } from 'node:module';
import { extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const copyBytes = Buffer.from.bind(Buffer);
const kinds = new Set(['module', 'commonjs', 'json']);

/**
 * Observe a closed, freshly built worker's module closure before owned imports.
 * The supervisor supplies its independently checked build roster. This layer
 * proves evaluated byte membership; it does not prove that build or HTTP reachability.
 */
export function installHttpModuleCustody(receipt) {
  const fail = (message) => {
    const error = new Error(message);
    error.code = 'HTTP_MODULE_CUSTODY_INVALID';
    throw error;
  };
  if (
    !receipt ||
    receipt.schemaVersion !== 1 ||
    receipt.nodeVersion !== process.versions.node ||
    process.versions.node !== '24.20.0' ||
    !/^[a-f0-9]{64}$/u.test(receipt.nodeSha256 ?? '') ||
    digest(readFileSync(realpathSync(process.execPath))) !== receipt.nodeSha256
  )
    fail('Unbound HTTP worker Node executable');
  if (
    process.execArgv.length !== 0 ||
    process.env.NODE_OPTIONS ||
    process.env.NODE_PATH ||
    process.env.NODE_COMPILE_CACHE ||
    process.env.NODE_DISABLE_COMPILE_CACHE !== '1' ||
    Object.keys(require.cache).length !== 0
  )
    fail('HTTP custody requires a fresh worker without ambient loading or compile cache');
  if (!Array.isArray(receipt.files) || receipt.files.length === 0)
    fail('Missing HTTP build module roster');
  const nodeVersion = receipt.nodeVersion;
  const nodeSha256 = receipt.nodeSha256;

  const roster = new Map();
  for (const member of receipt.files) {
    if (
      !member ||
      typeof member.url !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(member.sha256 ?? '') ||
      !kinds.has(member.moduleKind)
    )
      fail('Malformed HTTP build module member');
    const url = new URL(member.url);
    if (url.protocol !== 'file:' || url.search || url.hash)
      fail('HTTP build member must be a plain file URL');
    const path = fileURLToPath(url);
    const canonical = pathToFileURL(realpathSync(path)).href;
    if (url.href !== canonical || roster.has(canonical))
      fail('HTTP build member is duplicated or not a canonical real path');
    const extension = extname(path);
    if (
      !['.js', '.mjs', '.cjs', '.json'].includes(extension) ||
      (extension === '.json' && member.moduleKind !== 'json') ||
      (extension === '.mjs' && member.moduleKind !== 'module') ||
      (extension === '.cjs' && member.moduleKind !== 'commonjs') ||
      (extension !== '.json' && member.moduleKind === 'json')
    )
      fail('Unsupported HTTP build module kind');
    if (digest(readFileSync(path)) !== member.sha256)
      fail('HTTP build member changed before worker loading');
    roster.set(canonical, Object.freeze({ ...member }));
  }

  let refusal;
  let closed = false;
  const resolutions = [];
  const evaluations = [];
  const evaluated = new Map();
  const refuse = (message) => {
    refusal ??= message;
    fail(message);
  };
  const lookup = (value) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      return refuse('HTTP worker resolved a non-URL module');
    }
    if (url.protocol !== 'file:' || url.search || url.hash)
      return refuse('HTTP worker resolved an unsupported module URL');
    const canonical = pathToFileURL(realpathSync(fileURLToPath(url))).href;
    const member = roster.get(canonical);
    if (!member) return refuse('HTTP worker resolved a module outside the build roster');
    return { canonical, member };
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        const result = nextResolve(specifier, context);
        if (isBuiltin(result.url)) {
          resolutions.push({
            specifier,
            parentURL: context.parentURL ?? null,
            conditions: [...context.conditions],
            url: result.url,
            builtin: true,
          });
        } else {
          const { canonical } = lookup(result.url);
          resolutions.push({
            specifier,
            parentURL: context.parentURL ?? null,
            conditions: [...context.conditions],
            url: result.url,
            canonicalURL: canonical,
            builtin: false,
          });
        }
        return result;
      } catch (error) {
        refusal ??= 'HTTP worker module resolution failed';
        throw error;
      }
    },
    load(url, context, nextLoad) {
      try {
        const result = nextLoad(url, context);
        if (isBuiltin(url)) return result;
        const { canonical, member } = lookup(url);
        const source = result.source;
        if (typeof source !== 'string' && !(source instanceof Uint8Array))
          refuse('HTTP worker module has no evaluated source bytes');
        const bytes = copyBytes(source);
        const sha256 = digest(bytes);
        if (sha256 !== member.sha256)
          refuse('HTTP worker evaluated bytes differ from the build roster');
        // Node can report undefined for a CJS child. Retain that raw observation;
        // the reviewed build roster supplies its independently derived kind.
        if (result.format !== undefined && result.format !== member.moduleKind)
          refuse('HTTP worker evaluated an unexpected module format');
        if (result.format === undefined && member.moduleKind !== 'commonjs')
          refuse('HTTP worker omitted a non-CJS module format');
        const previous = evaluated.get(canonical);
        if (previous && previous !== sha256)
          refuse('HTTP worker module changed during measurement');
        evaluated.set(canonical, sha256);
        evaluations.push({
          url,
          canonicalURL: canonical,
          sha256,
          byteLength: bytes.length,
          observedFormat: result.format ?? null,
          moduleKind: member.moduleKind,
        });
        return result;
      } catch (error) {
        refusal ??= 'HTTP worker module evaluation failed';
        throw error;
      }
    },
  });

  const assertValid = () => {
    if (closed) fail('HTTP module observation ended before measurement completion');
    if (refusal) fail(refusal);
    if (evaluated.size === 0) fail('HTTP worker evaluated no bound modules');
  };
  return Object.freeze({
    assertValid,
    snapshot() {
      assertValid();
      return {
        schemaVersion: 1,
        complete: false,
        readinessPromoting: false,
        nodeVersion,
        nodeSha256,
        resolutions: resolutions.map((entry) => ({ ...entry, conditions: [...entry.conditions] })),
        evaluations: evaluations.map((entry) => ({ ...entry })),
      };
    },
    close() {
      closed = true;
      hooks.deregister();
    },
  });
}
