// Pure publication decisions shared by the release preflight and its sensors.
export class PublicationDistTagError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PublicationDistTagError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PublicationDistTagError(code, message);
}

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const rcVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.(0|[1-9]\d*)$/u;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkedDistTags(value) {
  if (!isRecord(value) || Object.keys(value).length === 0 ||
    Object.entries(value).some(([tag, version]) => !tag || typeof version !== 'string' || !version)) {
    fail('PUBLICATION_DIST_TAG_UNKNOWN', 'registry dist-tags are absent or malformed');
  }
  return value;
}

export function selectPublicationDistTag({ version, preState }) {
  if (rcVersion.test(version)) {
    if (!isRecord(preState) || preState.mode !== 'pre' || preState.tag !== 'rc') {
      fail('PUBLICATION_DIST_TAG_INVALID', 'an RC candidate requires committed pre mode with the rc tag');
    }
    return 'rc';
  }
  if (stableVersion.test(version) && (preState === null || preState === undefined)) return 'latest';
  fail('PUBLICATION_DIST_TAG_INVALID', 'version and Changesets pre state do not select an approved dist-tag');
}

export function buildNpmPublishArgs({ tarball, registry, tag, version }) {
  if (typeof tarball !== 'string' || !tarball || typeof registry !== 'string' || !registry ||
    !((rcVersion.test(version) && tag === 'rc') || (stableVersion.test(version) && tag === 'latest'))) {
    fail('PUBLICATION_DIST_TAG_INVALID', 'npm publish arguments do not match the candidate dist-tag');
  }
  return ['publish', tarball, '--registry', registry, '--tag', tag, '--access', 'restricted'];
}

export function validatePreflightDistTags({ preflightLatest, distTags }) {
  const snapshot = checkedDistTags(distTags);
  if (typeof snapshot.latest !== 'string') {
    fail('PUBLICATION_DIST_TAG_UNKNOWN', 'registry latest dist-tag is absent');
  }
  if (snapshot.latest !== preflightLatest) {
    fail('PUBLICATION_DIST_TAG_DRIFT', 'registry latest dist-tag differs from the policy baseline');
  }
  return { ...snapshot };
}

export function verifyPostPublishDistTags({ candidate, preflightLatest, preflightDistTags, distTags }) {
  const before = validatePreflightDistTags({ preflightLatest, distTags: preflightDistTags });
  const after = checkedDistTags(distTags);
  const mutableTag = rcVersion.test(candidate) ? 'rc' : stableVersion.test(candidate) ? 'latest' : null;
  if (!mutableTag) fail('PUBLICATION_DIST_TAG_INVALID', 'candidate version is unsupported');
  for (const [tag, value] of Object.entries(before)) {
    if (tag !== mutableTag && after[tag] !== value) {
      fail('PUBLICATION_DIST_TAG_DRIFT', `registry dist-tag ${tag} changed during publication`);
    }
  }
  for (const tag of Object.keys(after)) {
    if (tag !== mutableTag && !Object.hasOwn(before, tag)) {
      fail('PUBLICATION_DIST_TAG_DRIFT', `unexpected registry dist-tag ${tag} appeared during publication`);
    }
  }
  if (after[mutableTag] !== candidate) {
    if (after[mutableTag] !== undefined && after[mutableTag] !== before[mutableTag]) {
      fail('PUBLICATION_DIST_TAG_DRIFT', `registry dist-tag ${mutableTag} points to an unexpected version`);
    }
    fail('PUBLICATION_DIST_TAG_UNKNOWN', `the candidate is not yet visible under the ${mutableTag} dist-tag`);
  }
}

export function assertNoPendingPreChangesets({ preState, changesetIds }) {
  if (!Array.isArray(changesetIds) ||
    changesetIds.some((id) => typeof id !== 'string' || !id || id.includes('/') || id.includes('..')) ||
    new Set(changesetIds).size !== changesetIds.length) {
    fail('PUBLICATION_DIST_TAG_INVALID', 'changeset IDs are malformed');
  }
  if (preState === null || preState === undefined) {
    if (changesetIds.length > 0) fail('PUBLICATION_DIST_TAG_INVALID', 'stable publication has pending changesets');
    return;
  }
  if (!isRecord(preState) || preState.mode !== 'pre' || preState.tag !== 'rc' ||
    !Array.isArray(preState.changesets) || preState.changesets.some((id) => typeof id !== 'string') ||
    new Set(preState.changesets).size !== preState.changesets.length ||
    changesetIds.length !== preState.changesets.length ||
    changesetIds.some((id) => !preState.changesets.includes(id))) {
    fail('PUBLICATION_DIST_TAG_INVALID', 'prerelease changesets are pending or missing');
  }
}
