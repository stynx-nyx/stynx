import { createHash } from 'node:crypto';
import {
  closeSync,
  chmodSync,
  constants,
  copyFileSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Development origins only. These pins do not admit a compiler, executable,
// native profile, qualification run, release gate or performance floor.
export const finiteK6Origins = Object.freeze({
  upstreamVersion: '0.49.0',
  tag: 'v0.49.0',
  tagObject: '23de52144eed35593ce0abfa046aff7684c48b2a',
  commit: 'b5328aa782832a80451ea430075af8845dffb7cd',
  tree: '10e746d28f5dc0c0047143a24ed37b663b39dc79',
  sourceFiles: 3168,
  sourceBytes: 48275899,
  sourceManifestSha256: 'fb1f32c20822e0e22d685c6db43648b99499e2617aa9ae9422c2ee41edeefdd8',
  vendorFiles: 2463,
  vendorBytes: 42926135,
  vendorManifestSha256: '6f2cc2e69f68e4e6fe5fccd67760a01a7c3e40cc145f5f93550903075aa28f8b',
  goVersion: 'go1.21.6',
  goSourceCommit: 'cc85462b3d23193e4861813ea85e254cfe372403',
  tagSignatureVerified: false,
});

const archives = Object.freeze({
  k6: Object.freeze({
    name: 'k6-b5328aa782832a80451ea430075af8845dffb7cd.tar.gz',
    url: 'https://codeload.github.com/grafana/k6/tar.gz/b5328aa782832a80451ea430075af8845dffb7cd',
    bytes: 9777400,
    sha256: 'ce0043ac6c2360d022e48cdf2b127a232016c8f65165aa6cd0261f29478ebf10',
  }),
  goSource: Object.freeze({
    name: 'go1.21.6.src.tar.gz',
    url: 'https://go.dev/dl/go1.21.6.src.tar.gz',
    bytes: 27058459,
    sha256: '124926a62e45f78daabbaedb9c011d97633186a33c238ffc1e25320c02046248',
  }),
  'linux-arm64': Object.freeze({
    name: 'go1.21.6.linux-arm64.tar.gz',
    url: 'https://go.dev/dl/go1.21.6.linux-arm64.tar.gz',
    bytes: 63801908,
    sha256: 'e2e8aa88e1b5170a0d495d7d9c766af2b2b6c6925a8f8956d834ad6b4cacbd9a',
  }),
  'darwin-arm64-diagnostic': Object.freeze({
    name: 'go1.21.6.darwin-arm64.tar.gz',
    url: 'https://go.dev/dl/go1.21.6.darwin-arm64.tar.gz',
    bytes: 65181002,
    sha256: '0ff541fb37c38e5e5c5bcecc8f4f43c5ffd5e3a6c33a5d3e4003ded66fcfb331',
  }),
});

const sourceFiles = Object.freeze({
  'go.mod': '405cc53819d05dec07a406ff964ec2f5e40719c451a1fc300ace6c551ea0b085',
  'go.sum': 'f6f99d6dad01b106818c339b1d4a21ee6c2c3da74c7c6a751318628ab5489109',
  'vendor/modules.txt': 'c20fef7fe036f9f79f09532f09cbb5517f1c88fa53b52ced6545efca78e12957',
  'lib/executor/constant_arrival_rate.go':
    '1ca1f44d6a4297be73a9ea9c641695b6b488040505b0f3654604c87ef513fb25',
});
const schedulerPath = 'lib/executor/constant_arrival_rate.go';
const schedulerOriginal = Object.freeze({
  path: schedulerPath,
  mode: '100644',
  gitBlob: '7b576e3a96f36a27c98b2930defe0ea86897692a',
  bytes: 12739,
  sha256: sourceFiles[schedulerPath],
});
const schedulerPatched = Object.freeze({
  path: schedulerPath,
  mode: '100644',
  gitBlob: '737b7a144f13911763531aaee258217d0339bd54',
  bytes: 12813,
  sha256: '1a330754ac1cb274655da1b2962385759bfa9f1dcd2fc17aca4519ea1e929e54',
});
const patchPin = Object.freeze({
  bytes: 328,
  sha256: 'a6880fbffb99f0997cbe2b6b738ab89226ab5b590bb283af79124f151f5d920b',
});
const finiteSourceManifestSha256 =
  'fe74dec40e08086dfe1cc168a0390b6dd6c274773786ac7ebbb85d1aec4057b3';
const patchPath = fileURLToPath(new URL('../native/k6-finite-arrival.patch', import.meta.url));
const repoRoot = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const nativeFetch = globalThis.fetch;
const responseBody = Object.getOwnPropertyDescriptor(Response.prototype, 'body').get;
const responseStatus = Object.getOwnPropertyDescriptor(Response.prototype, 'status').get;
const responseHeaders = Object.getOwnPropertyDescriptor(Response.prototype, 'headers').get;
const headersGet = Headers.prototype.get;
const streamGetReader = ReadableStream.prototype.getReader;
const streamCancel = ReadableStream.prototype.cancel;
const readerRead = ReadableStreamDefaultReader.prototype.read;
const readerCancel = ReadableStreamDefaultReader.prototype.cancel;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = (rows) => Buffer.from(`${JSON.stringify(rows)}\n`);
const notPromoting = Object.freeze({
  derivative: true,
  derivativeBuilt: false,
  sourceReviewAccepted: false,
  nativeProfileAdmitted: false,
  runtimeCustodyComplete: false,
  performanceQualified: false,
  readinessPromoting: false,
});

function refuse(message) {
  throw new Error(`Finite k6 development origin refused: ${message}`);
}

function externalPath(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path)
    refuse('use a canonical absolute path');
  if (path === repoRoot || path.startsWith(`${repoRoot}${sep}`))
    refuse('third-party material must remain outside the repository');
  return path;
}

function realDirectory(path) {
  externalPath(path);
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path)
    refuse('directory must be real, without symlink components');
  return path;
}

function sameFile(a, b) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.mode === b.mode &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}

// Stream from an O_NOFOLLOW descriptor with a fixed initial size; EOF and
// identity rechecks reject growth/replacement without unbounded allocation.
function fileIdentity(path, maximumBytes, capture = false) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(maximumBytes))
      refuse('file kind, hard-link count or byte bound differs');
    const bytes = Number(before.size);
    const hash = createHash('sha256');
    const blob = createHash('sha1').update(`blob ${bytes}\0`);
    const buffer = Buffer.alloc(64 * 1024);
    const body = capture ? Buffer.alloc(bytes) : null;
    let offset = 0;
    while (offset < bytes) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, bytes - offset), offset);
      if (!count) refuse('file truncated while reading');
      hash.update(buffer.subarray(0, count));
      blob.update(buffer.subarray(0, count));
      if (body) buffer.copy(body, offset, 0, count);
      offset += count;
    }
    if (readSync(fd, buffer, 0, 1, bytes) !== 0) refuse('file grew while reading');
    const after = fstatSync(fd, { bigint: true });
    const named = lstatSync(path, { bigint: true });
    if (!sameFile(before, after) || !sameFile(before, named))
      refuse('file identity changed while reading');
    return {
      mode: before.mode & 0o111n ? '100755' : '100644',
      gitBlob: blob.digest('hex'),
      bytes,
      sha256: hash.digest('hex'),
      ...(capture ? { body } : {}),
    };
  } finally {
    closeSync(fd);
  }
}

function selectedArchives(platform) {
  if (!['linux-arm64', 'darwin-arm64-diagnostic'].includes(platform))
    refuse('unknown platform; only Linux arm64 or explicitly diagnostic Darwin arm64');
  return [archives.k6, archives.goSource, archives[platform]];
}

function receipt(kind, extra) {
  return {
    schemaVersion: 1,
    scope: 'finite-k6-development-origins',
    kind,
    origins: finiteK6Origins,
    ...extra,
    ...notPromoting,
  };
}

function inspectSource(sourceRoot, variant = 'upstream') {
  realDirectory(sourceRoot);
  const rows = [];
  let entries = 0;
  let totalBytes = 0;
  function visit(directory, prefix = '', depth = 0) {
    if (depth > 32) refuse('source directory depth exceeds bound');
    const before = lstatSync(directory, { bigint: true });
    if (!before.isDirectory()) refuse('source directory replaced');
    // Bounded native prefetch and at most33 open directory handles. Never
    // materialize/sort an arbitrary directory before enforcing the global cap.
    const handle = opendirSync(directory, { encoding: 'buffer', bufferSize: 32 });
    try {
      for (;;) {
        const entry = handle.readSync();
        if (!entry) break;
        if (++entries > 10000) refuse('source entry count exceeds bound');
        const name = textDecoder.decode(entry.name);
        if (!name || ['.', '..'].includes(name) || /[\\\0]/u.test(name))
          refuse('invalid source entry name');
        const path = join(directory, name);
        const relative = prefix ? `${prefix}/${name}` : name;
        const stat = lstatSync(path);
        if (!prefix && name === '.git') {
          if (!stat.isDirectory()) refuse('unexpected Git metadata kind');
          continue;
        }
        if (stat.isDirectory()) visit(path, relative, depth + 1);
        else {
          if (!stat.isFile()) refuse('source contains a symlink or unsupported entry');
          const row = { path: relative, ...fileIdentity(path, 16 * 1024 * 1024) };
          totalBytes += row.bytes;
          if (rows.length >= 4096 || totalBytes > 64 * 1024 * 1024)
            refuse('source population exceeds bounds');
          rows.push(row);
        }
      }
    } finally {
      handle.closeSync();
    }
    if (!sameFile(before, lstatSync(directory, { bigint: true })))
      refuse('source directory changed while scanning');
  }
  visit(sourceRoot);
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const vendor = rows.filter((row) => row.path.startsWith('vendor/'));
  const sourceManifestSha256 = sha256(manifestBytes(rows));
  const vendorManifestSha256 = sha256(manifestBytes(vendor));
  let upstreamRows = rows;
  if (variant === 'finite') {
    const scheduler = rows.find((row) => row.path === schedulerPath);
    if (JSON.stringify(scheduler) !== JSON.stringify(schedulerPatched))
      refuse('finite scheduler file differs');
    if (sourceManifestSha256 !== finiteSourceManifestSha256)
      refuse('complete finite source manifest differs');
    // Restore exactly the single known file in the observed manifest. Matching
    // the complete original digest proves no test seam or other file entered it.
    upstreamRows = rows.map((row) => (row.path === schedulerPath ? schedulerOriginal : row));
  }
  const upstreamManifestSha256 = sha256(manifestBytes(upstreamRows));
  if (
    rows.length !== finiteK6Origins.sourceFiles ||
    upstreamRows.reduce((bytes, row) => bytes + row.bytes, 0) !== finiteK6Origins.sourceBytes ||
    upstreamManifestSha256 !== finiteK6Origins.sourceManifestSha256 ||
    vendor.length !== finiteK6Origins.vendorFiles ||
    vendor.reduce((bytes, row) => bytes + row.bytes, 0) !== finiteK6Origins.vendorBytes ||
    vendorManifestSha256 !== finiteK6Origins.vendorManifestSha256
  )
    refuse('complete source/vendor manifest differs');
  for (const [path, expected] of Object.entries(sourceFiles))
    if (upstreamRows.find((row) => row.path === path)?.sha256 !== expected)
      refuse(`bound source differs: ${path}`);
  return {
    rows,
    evidence: receipt(`${variant}-source-verification`, {
      sourceFrozen: false,
      atomicSnapshotClaimed: false,
      sourceFiles: rows.length,
      sourceBytes: totalBytes,
      sourceManifestSha256,
      upstreamManifestSha256,
      vendorManifestSha256,
      productionInstrumentationPresent: false,
      changedSourceFiles: variant === 'finite' ? [schedulerPath] : [],
      boundFiles: rows.filter((row) => Object.hasOwn(sourceFiles, row.path)),
    }),
  };
}

/** Read-only verification of complete unmodified upstream source and vendor. */
export function verifyFiniteK6Source(sourceRoot) {
  return inspectSource(sourceRoot).evidence;
}

/** Read-only verification of the complete source with only the exact guard. */
export function verifyFiniteK6ProductionSource(sourceRoot) {
  return inspectSource(sourceRoot, 'finite').evidence;
}

function fixedPatch() {
  const patch = fileIdentity(patchPath, patchPin.bytes, true);
  if (patch.bytes !== patchPin.bytes || patch.sha256 !== patchPin.sha256)
    refuse('tracked patch identity differs');
  const lines = patch.body.toString('utf8').split('\n');
  if (
    lines[0] !== `--- a/${schedulerPath}` ||
    lines[1] !== `+++ b/${schedulerPath}` ||
    lines[2] !== '@@ -328 +328,5 @@' ||
    lines.pop() !== '' ||
    lines.slice(3).some((line) => ![' ', '+', '-'].includes(line[0]))
  )
    refuse('unexpected single-file patch structure');
  const hunk = lines.slice(3);
  const before = hunk.filter((line) => [' ', '-'].includes(line[0])).map((line) => line.slice(1));
  const after = hunk.filter((line) => [' ', '+'].includes(line[0])).map((line) => line.slice(1));
  if (before.length !== 1 || after.length !== 5) refuse('patch hunk population differs');
  return { body: patch.body, before: `${before.join('\n')}\n`, after: `${after.join('\n')}\n` };
}

/** Stage a separate private production source copy; never alter the original
 * upstream tree or import Inspector instrumentation/test support. Does not build.
 */
export function stageFiniteK6Source(sourceRoot, outputRoot, platform) {
  selectedArchives(platform);
  const upstream = inspectSource(sourceRoot);
  const patch = fixedPatch();
  externalPath(outputRoot);
  realDirectory(dirname(outputRoot));
  if (outputRoot === sourceRoot || outputRoot.startsWith(`${sourceRoot}${sep}`))
    refuse('output cannot be inside upstream source');
  mkdirSync(outputRoot, { mode: 0o700 });
  const productionRoot = join(outputRoot, 'source');
  mkdirSync(productionRoot, { mode: 0o700 });
  for (const row of upstream.rows) {
    const destination = join(productionRoot, row.path);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(join(sourceRoot, row.path), destination, constants.COPYFILE_EXCL);
    chmodSync(destination, row.mode === '100755' ? 0o755 : 0o644);
  }
  // All copied bytes are verified before actuation; no Git metadata, extra
  // source, test support or generated file is allowed by this complete manifest.
  inspectSource(productionRoot);
  const target = join(productionRoot, schedulerPath);
  const original = fileIdentity(target, schedulerOriginal.bytes, true);
  if (original.sha256 !== schedulerOriginal.sha256) refuse('patch input differs');
  const text = original.body.toString('utf8');
  if (text.split(patch.before).length !== 2) refuse('patch context is not unique');
  const changed = Buffer.from(text.replace(patch.before, patch.after));
  if (changed.length !== schedulerPatched.bytes || sha256(changed) !== schedulerPatched.sha256)
    refuse('patch result differs');
  const temporary = `${target}.finite-part`;
  writeFileSync(temporary, changed, { flag: 'wx', mode: 0o644 });
  renameSync(temporary, target);
  const staged = inspectSource(productionRoot, 'finite');
  // Check the caller's source again; it remains unpatched and independently usable.
  inspectSource(sourceRoot);
  writeFileSync(join(outputRoot, 'finite-arrival.patch'), patch.body, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(outputRoot, 'source-manifest.json'), manifestBytes(staged.rows), {
    flag: 'wx',
    mode: 0o600,
  });
  const result = receipt('finite-production-source-staging', {
    platform,
    productionDirectoryName: 'source',
    patch: patchPin,
    source: staged.evidence,
    sourceFrozen: false,
    atomicSnapshotClaimed: false,
    productionInstrumentationPresent: false,
    officialHistoricalProfilesModified: false,
  });
  writeFileSync(join(outputRoot, 'staging.json'), `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  return result;
}

/** Verify origin archives without unpacking or executing compiler/source. */
export function verifyFiniteK6Archives(directory, platform) {
  realDirectory(directory);
  const verified = selectedArchives(platform).map((pin) => {
    const actual = fileIdentity(join(directory, pin.name), pin.bytes);
    if (actual.bytes !== pin.bytes || actual.sha256 !== pin.sha256)
      refuse(`archive differs: ${pin.name}`);
    return { ...pin, observedBytes: actual.bytes, observedSha256: actual.sha256 };
  });
  return receipt('archive-verification', { platform, archives: verified });
}

function redirectAllowed(url, origin) {
  const parsed = new URL(url);
  return (
    parsed.protocol === 'https:' &&
    !parsed.username &&
    !parsed.password &&
    !parsed.port &&
    !parsed.hash &&
    !parsed.search &&
    (parsed.href === origin.url ||
      (origin.url.startsWith('https://go.dev/dl/') &&
        parsed.href === `https://dl.google.com/go/${origin.name}`))
  );
}

async function cancelBody(body, reader) {
  if (!body) return;
  let timer;
  try {
    await Promise.race([
      Reflect.apply(reader ? readerCancel : streamCancel, reader ?? body, []),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Archive body cancellation deadline exceeded')),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Source-used stream boundary, not origin authority. The pin is selected only
 * from the internal immutable roster. A real local HTTP Response can exercise
 * stream/refusal/cancellation behavior without injecting a production URL/fetch.
 * The fixed-origin caller owns the90s fetch deadline; this helper never admits
 * origin trust, transport custody, native readiness or qualification.
 */
export async function consumeFiniteK6ArchiveResponse(response, archiveName, temporary) {
  let body;
  let fd;
  let reader;
  let failure;
  let pin;
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    body = Reflect.apply(responseBody, response, []);
    pin = Object.values(archives).find((candidate) => candidate.name === archiveName);
    if (!pin) refuse('unknown internally pinned archive');
    externalPath(temporary);
    realDirectory(dirname(temporary));
    if (basename(temporary) !== `${pin.name}.part`) refuse('archive sink name differs');
    if (Reflect.apply(responseStatus, response, []) !== 200 || !body)
      refuse('archive HTTP response differs');
    const headers = Reflect.apply(responseHeaders, response, []);
    const contentLength = Reflect.apply(headersGet, headers, ['content-length']);
    if (contentLength !== null && contentLength !== String(pin.bytes))
      refuse('archive declared byte count differs');
    if (Reflect.apply(headersGet, headers, ['content-encoding']))
      refuse('encoded archive response refused');
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    reader = Reflect.apply(streamGetReader, body, []);
    for (;;) {
      const chunk = await Reflect.apply(readerRead, reader, []);
      if (chunk.done) break;
      if (bytes + chunk.value.byteLength > pin.bytes) refuse('archive stream exceeds bound');
      hash.update(chunk.value);
      let written = 0;
      while (written < chunk.value.byteLength) {
        const count = writeSync(fd, chunk.value, written, chunk.value.byteLength - written);
        if (!count) refuse('archive write made no progress');
        written += count;
      }
      bytes += chunk.value.byteLength;
    }
    if (bytes !== pin.bytes || hash.digest('hex') !== pin.sha256)
      refuse('archive digest/byte count differs');
    fsyncSync(fd);
  } catch (error) {
    failure = error;
  } finally {
    try {
      // Includes status/header refusals that happen before acquiring a reader.
      await cancelBody(body, reader);
    } catch (error) {
      failure = new AggregateError(
        failure ? [failure, error] : [error],
        'Finite k6 archive response cancellation failed; archive remains refused',
      );
    } finally {
      if (fd !== undefined) {
        closeSync(fd);
        if (failure) unlinkSync(temporary);
      }
    }
  }
  if (failure) throw failure;
  return { archiveName: pin.name, bytes, sha256: pin.sha256, originAdmitted: false };
}

async function downloadArchive(root, pin) {
  const temporary = join(root, `${pin.name}.part`);
  let response;
  let consumed = false;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 90000);
  try {
    let url = pin.url;
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!redirectAllowed(url, pin))
        refuse('archive redirected outside its fixed official origin');
      response = await nativeFetch(url, { redirect: 'manual', signal: controller.signal });
      const status = Reflect.apply(responseStatus, response, []);
      if (![301, 302, 303, 307, 308].includes(status)) break;
      const location = Reflect.apply(headersGet, Reflect.apply(responseHeaders, response, []), [
        'location',
      ]);
      await cancelBody(Reflect.apply(responseBody, response, []));
      if (!location || redirects === 3) refuse('archive redirect bound exceeded');
      url = new URL(location, url).href;
    }
    // Even early final-response refusals enter the source-used cancellation
    // boundary; failed/ambiguous cancellation never promotes an archive.
    await consumeFiniteK6ArchiveResponse(response, pin.name, temporary);
    consumed = true;
  } finally {
    clearTimeout(deadline);
    if (!consumed) controller.abort();
  }
  renameSync(temporary, join(root, pin.name));
}

/** Acquire only three immutable origins into a new private external directory.
 * No extraction, install, source patch, build or executable actuation occurs.
 */
export async function acquireFiniteK6Origins(outputRoot, platform) {
  externalPath(outputRoot);
  realDirectory(dirname(outputRoot));
  const pins = selectedArchives(platform);
  mkdirSync(outputRoot, { mode: 0o700 });
  for (const pin of pins) await downloadArchive(outputRoot, pin);
  const result = verifyFiniteK6Archives(outputRoot, platform);
  writeFileSync(join(outputRoot, 'origins.json'), `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  return result;
}

/** Proposed commands only. An installed native profile and independent source
 * acceptance remain mandatory; this recipe is not a build receipt or admission.
 */
export function finiteK6BuildPlan(platform) {
  selectedArchives(platform);
  return receipt('unexecuted-build-plan', {
    platform,
    buildIdentifier: 'stynx-k6-0.49.0-finite-arrival-v1',
    upstreamVersionIsAncestryOnly: true,
    versionOutputDoesNotEstablishIdentity: true,
    sourcePatchSha256: patchPin.sha256,
    patchedSourceManifestSha256: finiteSourceManifestSha256,
    executableSha256: null,
    installedToolchainManifestSha256: null,
    nativeProfileIdentity: null,
    command: [
      '<verified-private-go-root>/bin/go',
      'build',
      '-mod=vendor',
      '-trimpath',
      '-buildvcs=false',
      '-ldflags=-buildid=stynx-k6-0.49.0-finite-arrival-v1',
      '-o',
      '<private-output>/stynx-k6-0.49.0-finite-arrival-v1',
      '.',
    ],
    environment: {
      GOOS: platform === 'linux-arm64' ? 'linux' : 'darwin',
      GOARCH: 'arm64',
      CGO_ENABLED: '0',
      GOTOOLCHAIN: 'local',
      GOPROXY: 'off',
      GOSUMDB: 'off',
      GOWORK: 'off',
      GOENV: 'off',
      GOFLAGS: '',
      GOROOT: '<verified-private-go-root>',
      GOCACHE: '<private-clean-go-cache>',
      GOMODCACHE: '<private-empty-module-cache>',
      HOME: '<private-home>',
      TMPDIR: '<private-temporary-directory>',
      PATH: '<verified-private-go-root>/bin',
    },
    diagnosticOnly: platform === 'darwin-arm64-diagnostic',
    officialHistoricalProfilesModified: false,
    pending: [
      'independent native scheduler green evidence and source review',
      'verified extraction and complete installed Go toolchain identity',
      'exact native Linux arm64 DEVAI profile and supported interface',
      'actual build identities and reproducibility observation',
      'prospective Architect descriptor and registered task admission',
    ],
  });
}

export function parseFiniteK6Arguments(args) {
  const stage = args[0] === 'stage-source';
  if (args.length !== (stage ? 5 : 4) || args[stage ? 3 : 2] !== '--platform')
    refuse('expected mode <absolute-path> [new-output-for-stage-source] --platform <platform>');
  const mode = args[0];
  const path = args[1];
  const output = stage ? args[2] : undefined;
  const platform = args[stage ? 4 : 3];
  if (
    !['acquire', 'verify-archives', 'verify-source', 'verify-production', 'stage-source'].includes(
      mode,
    )
  )
    refuse('unknown mode');
  selectedArchives(platform);
  externalPath(path);
  if (!basename(path)) refuse('missing directory name');
  if (stage) externalPath(output);
  return { mode, path, output, platform };
}
