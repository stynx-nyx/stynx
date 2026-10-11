import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
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
const repoRoot = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const textDecoder = new TextDecoder('utf-8', { fatal: true });
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
function fileIdentity(path, maximumBytes) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(maximumBytes))
      refuse('file kind, hard-link count or byte bound differs');
    const bytes = Number(before.size);
    const hash = createHash('sha256');
    const blob = createHash('sha1').update(`blob ${bytes}\0`);
    const buffer = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < bytes) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, bytes - offset), offset);
      if (!count) refuse('file truncated while reading');
      hash.update(buffer.subarray(0, count));
      blob.update(buffer.subarray(0, count));
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

/** Read-only verification of complete unmodified upstream source and vendor. */
export function verifyFiniteK6Source(sourceRoot) {
  realDirectory(sourceRoot);
  const rows = [];
  let entries = 0;
  let totalBytes = 0;
  function visit(directory, prefix = '') {
    const before = lstatSync(directory, { bigint: true });
    if (!before.isDirectory()) refuse('source directory replaced');
    for (const rawName of readdirSync(directory, { encoding: 'buffer' }).sort(Buffer.compare)) {
      const name = textDecoder.decode(rawName);
      if (!name || ['.', '..'].includes(name) || /[\\\0]/u.test(name))
        refuse('invalid source entry name');
      if (++entries > 10000) refuse('source entry count exceeds bound');
      const path = join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(path);
      if (!prefix && name === '.git') {
        if (!stat.isDirectory()) refuse('unexpected Git metadata kind');
        continue;
      }
      if (stat.isDirectory()) visit(path, relative);
      else {
        if (!stat.isFile()) refuse('source contains a symlink or unsupported entry');
        const row = { path: relative, ...fileIdentity(path, 16 * 1024 * 1024) };
        totalBytes += row.bytes;
        if (rows.length >= 4096 || totalBytes > 64 * 1024 * 1024)
          refuse('source population exceeds bounds');
        rows.push(row);
      }
    }
    if (!sameFile(before, lstatSync(directory, { bigint: true })))
      refuse('source directory changed while scanning');
  }
  visit(sourceRoot);
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const vendor = rows.filter((row) => row.path.startsWith('vendor/'));
  const sourceManifestSha256 = sha256(manifestBytes(rows));
  const vendorManifestSha256 = sha256(manifestBytes(vendor));
  if (
    rows.length !== finiteK6Origins.sourceFiles ||
    totalBytes !== finiteK6Origins.sourceBytes ||
    sourceManifestSha256 !== finiteK6Origins.sourceManifestSha256 ||
    vendor.length !== finiteK6Origins.vendorFiles ||
    vendor.reduce((bytes, row) => bytes + row.bytes, 0) !== finiteK6Origins.vendorBytes ||
    vendorManifestSha256 !== finiteK6Origins.vendorManifestSha256
  )
    refuse('complete source/vendor manifest differs');
  for (const [path, expected] of Object.entries(sourceFiles))
    if (rows.find((row) => row.path === path)?.sha256 !== expected)
      refuse(`bound source differs: ${path}`);
  return receipt('upstream-source-verification', {
    sourceFrozen: false,
    atomicSnapshotClaimed: false,
    sourceFiles: rows.length,
    sourceBytes: totalBytes,
    sourceManifestSha256,
    vendorManifestSha256,
    boundFiles: rows.filter((row) => Object.hasOwn(sourceFiles, row.path)),
  });
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

async function downloadArchive(root, pin) {
  const temporary = join(root, `${pin.name}.part`);
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  const hash = createHash('sha256');
  let bytes = 0;
  let reader;
  let complete = false;
  try {
    const signal = AbortSignal.timeout(90000);
    let url = pin.url;
    let response;
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!redirectAllowed(url, pin))
        refuse('archive redirected outside its fixed official origin');
      response = await fetch(url, { redirect: 'manual', signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 3) refuse('archive redirect bound exceeded');
      url = new URL(location, url).href;
    }
    if (response.status !== 200 || !response.body) refuse('archive HTTP response differs');
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && contentLength !== String(pin.bytes))
      refuse('archive declared byte count differs');
    if (response.headers.get('content-encoding')) refuse('encoded archive response refused');
    reader = response.body.getReader();
    for (;;) {
      const chunk = await reader.read();
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
    complete = true;
  } finally {
    try {
      if (reader) await reader.cancel();
    } finally {
      closeSync(fd);
      if (!complete) unlinkSync(temporary);
    }
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
    sourcePatchSha256: null,
    patchedSourceManifestSha256: null,
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
      'independent native scheduler test setup and red/green evidence',
      'finite source patch, complete diff and independent source review',
      'verified extraction and complete installed Go toolchain identity',
      'exact native Linux arm64 DEVAI profile and supported interface',
      'actual build identities and reproducibility observation',
      'prospective Architect descriptor and registered task admission',
    ],
  });
}

export function parseFiniteK6Arguments(args) {
  if (args.length !== 4 || args[2] !== '--platform')
    refuse('expected acquire|verify-archives|verify-source <absolute-path> --platform <platform>');
  const [mode, path, , platform] = args;
  if (!['acquire', 'verify-archives', 'verify-source'].includes(mode)) refuse('unknown mode');
  selectedArchives(platform);
  externalPath(path);
  if (!basename(path)) refuse('missing directory name');
  return { mode, path, platform };
}
