// Fixed-group version rule for the STYNX release unit.
//
// Every publishable @stynx-nyx/* package sits in one Changesets `fixed` group,
// so a release moves all of them to one shared version. Changesets still runs
// its peer-dependency inference on top of that: any non-patch bump of a package
// that a sibling lists under `peerDependencies` promotes the sibling to a
// *major*, and `workspace:*` (which the release policy requires for exact-pin
// publication) is read as "exactly the previous version", so the promotion
// fires on every minor. The 1.3.0 release therefore came out of
// `changeset version` as 2.0.0.
//
// The rule implemented here is the one the fixed group already promises: the
// group's next version is the current unified version advanced by the highest
// bump type that a pending changeset *declares* for a group member. A major is
// a major only when a changeset says so. After `changeset version` has written
// manifests and CHANGELOGs, the generated version is rewritten to the expected
// one wherever it appears in the release unit.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectPublicPackages } from './release-version-policy.mjs';

export const bumpTypes = Object.freeze(['patch', 'minor', 'major']);

export class FixedGroupVersionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FixedGroupVersionError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new FixedGroupVersionError(code, message);
}

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const prerelease = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-([A-Za-z0-9-]+)\.(0|[1-9]\d*)$/u;

function changesetId(file) {
  return file.slice('.changeset/'.length, -'.md'.length);
}

function validatePreState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
    !['pre', 'exit'].includes(state.mode) || typeof state.tag !== 'string' ||
    !/^[A-Za-z0-9-]+$/u.test(state.tag) || !state.initialVersions ||
    typeof state.initialVersions !== 'object' || Array.isArray(state.initialVersions) ||
    !Array.isArray(state.changesets) ||
    state.changesets.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) ||
    new Set(state.changesets).size !== state.changesets.length) {
    fail('PRE_STATE_MALFORMED', 'Changesets prerelease state is malformed');
  }
  return state;
}

export function readPreState(repoRoot) {
  const path = resolve(repoRoot, '.changeset', 'pre.json');
  if (!existsSync(path)) return null;
  try {
    return validatePreState(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    if (error instanceof FixedGroupVersionError) throw error;
    fail('PRE_STATE_MALFORMED', 'Changesets prerelease state is not valid JSON');
  }
}

export function validateGeneratedVersionTransition({ beforePreState, afterPreState, current, generated, pendingIds }) {
  const before = validatePreState(beforePreState);
  if (!Array.isArray(pendingIds) || (before.mode === 'pre' && pendingIds.length === 0) ||
    pendingIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) ||
    new Set(pendingIds).size !== pendingIds.length) {
    fail('PRE_TRANSITION_INVALID', 'pending changeset IDs are malformed');
  }
  if (before.mode === 'exit') {
    if (!semver.test(generated)) fail('PRE_TRANSITION_INVALID', 'exit must generate a stable version');
    if (afterPreState !== null && afterPreState !== undefined) {
      const after = validatePreState(afterPreState);
      if (after.mode !== 'exit' || after.tag !== before.tag) {
        fail('PRE_TRANSITION_INVALID', 'exit mode or tag changed during versioning');
      }
    }
    return;
  }
  const after = validatePreState(afterPreState);
  if (after.mode !== before.mode || after.tag !== before.tag ||
    JSON.stringify(after.initialVersions) !== JSON.stringify(before.initialVersions)) {
    fail('PRE_TRANSITION_INVALID', 'prerelease mode, tag, or initial versions changed during versioning');
  }
  const expectedIds = new Set([...before.changesets, ...pendingIds]);
  if (expectedIds.size !== before.changesets.length + pendingIds.length ||
    after.changesets.length !== expectedIds.size ||
    after.changesets.some((id) => !expectedIds.has(id))) {
    fail('PRE_TRANSITION_INVALID', 'Changesets did not consume exactly the pending IDs');
  }
  const match = prerelease.exec(generated);
  const currentMatch = prerelease.exec(current);
  if (currentMatch && currentMatch[4] !== before.tag) {
    fail('PRE_TRANSITION_INVALID', 'current prerelease tag does not match pre state');
  }
  const expectedOrdinal = currentMatch ? Number(currentMatch[5]) + 1 : 0;
  if (!match || match[4] !== before.tag || Number(match[5]) !== expectedOrdinal ||
    (!currentMatch && !semver.test(current))) {
    fail('PRE_TRANSITION_INVALID', 'Changesets generated an unexpected prerelease version');
  }
}

export function parseChangesetFrontmatter(source, fileName = 'changeset') {
  const lines = source.split(/\r?\n/u);
  if (lines[0]?.trim() !== '---') {
    fail('CHANGESET_FRONTMATTER_MISSING', `${fileName}: changeset must start with a --- line`);
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) {
    fail('CHANGESET_FRONTMATTER_MISSING', `${fileName}: changeset frontmatter is not closed`);
  }
  const releases = [];
  for (const raw of lines.slice(1, end)) {
    const line = raw.trim();
    if (line === '') continue;
    const match = /^(['"]?)(@?[^'":]+)\1\s*:\s*(patch|minor|major)\s*$/u.exec(line);
    if (!match) {
      fail(
        'CHANGESET_FRONTMATTER_MALFORMED',
        `${fileName}: unsupported frontmatter line "${line}"`,
      );
    }
    releases.push({ name: match[2], type: match[3] });
  }
  return {
    releases,
    summary: lines
      .slice(end + 1)
      .join('\n')
      .trim(),
  };
}

export function readPendingChangesets(repoRoot) {
  const directory = resolve(repoRoot, '.changeset');
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.md') && entry.toLowerCase() !== 'readme.md')
    .sort()
    .map((entry) => {
      const parsed = parseChangesetFrontmatter(
        readFileSync(resolve(directory, entry), 'utf8'),
        `.changeset/${entry}`,
      );
      return { file: `.changeset/${entry}`, ...parsed };
    });
}

export function computeFixedGroupBump(changesets, groupNames) {
  const members = new Set(groupNames);
  let highest = -1;
  for (const changeset of changesets) {
    for (const release of changeset.releases) {
      if (!members.has(release.name)) continue;
      highest = Math.max(highest, bumpTypes.indexOf(release.type));
    }
  }
  return highest === -1 ? null : bumpTypes[highest];
}

export function incrementVersion(version, bump) {
  const match = semver.exec(version);
  if (!match) fail('VERSION_MALFORMED', `"${version}" is not a stable semver version`);
  const [major, minor, patch] = match.slice(1).map(Number);
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return fail('BUMP_UNSUPPORTED', `unsupported bump type "${bump}"`);
  }
}

export function fixedGroupNames(changesetConfig) {
  const groups = Array.isArray(changesetConfig?.fixed) ? changesetConfig.fixed : [];
  if (groups.length !== 1 || !Array.isArray(groups[0]) || groups[0].length === 0) {
    fail('FIXED_GROUP_UNSUPPORTED', 'the release unit must be exactly one non-empty fixed group');
  }
  return [...groups[0]];
}

export function unifiedVersion(repoRoot) {
  const packages = collectPublicPackages(repoRoot);
  const versions = new Set(packages.map(({ manifest }) => manifest.version));
  if (versions.size !== 1) {
    fail(
      'VERSION_NOT_UNIFIED',
      `public package versions are not unified: ${[...versions].sort().join(', ')}`,
    );
  }
  return [...versions][0];
}

export function planFixedGroupVersion(repoRoot, changesetConfig) {
  const groupNames = fixedGroupNames(changesetConfig);
  const publicNames = collectPublicPackages(repoRoot).map(({ manifest }) => manifest.name);
  const outside = publicNames.filter((name) => !groupNames.includes(name));
  if (outside.length > 0) {
    fail(
      'FIXED_GROUP_ROSTER_DRIFT',
      `publishable packages outside the fixed group: ${outside.sort().join(', ')}`,
    );
  }
  const current = unifiedVersion(repoRoot);
  const allChangesets = readPendingChangesets(repoRoot);
  const preState = readPreState(repoRoot);
  let changesets = allChangesets;
  let initialVersion;
  if (preState) {
    const initialVersions = groupNames.map((name) => preState.initialVersions[name]);
    if (initialVersions.some((version) => typeof version !== 'string' || !semver.test(version)) ||
      new Set(initialVersions).size !== 1) {
      fail('PRE_VERSION_DRIFT', 'fixed-group initial versions are missing or not unified');
    }
    [initialVersion] = initialVersions;
    const availableIds = new Set(allChangesets.map(({ file }) => changesetId(file)));
    if (preState.changesets.some((id) => !availableIds.has(id))) {
      fail('PRE_CHANGESET_MISSING', 'a consumed prerelease changeset file is missing');
    }
    const currentPrerelease = prerelease.exec(current);
    if (preState.mode === 'pre') {
      if (semver.test(current)) {
        if (current !== initialVersion || preState.changesets.length > 0) {
          fail('PRE_VERSION_DRIFT', 'stable prerelease entry does not match initial state');
        }
      } else if (!currentPrerelease || currentPrerelease[4] !== preState.tag ||
        preState.changesets.length === 0) {
        fail('PRE_VERSION_DRIFT', 'current prerelease version or consumed changesets do not match pre state');
      }
      changesets = allChangesets.filter(({ file }) => !preState.changesets.includes(changesetId(file)));
    } else if (!currentPrerelease || currentPrerelease[4] !== preState.tag ||
      preState.changesets.length === 0) {
      fail('PRE_VERSION_DRIFT', 'exit requires a matching current prerelease');
    }
    const allBump = computeFixedGroupBump(allChangesets, groupNames);
    if (allBump === 'major' && preState.mode === 'pre') {
      fail('PRE_MAJOR_REQUIRES_OWNER', 'a major prerelease bump requires Owner decision');
    }
    const base = allBump === null ? initialVersion : incrementVersion(initialVersion, allBump);
    if (currentPrerelease && current.slice(0, current.indexOf('-')) !== base) {
      fail('PRE_VERSION_DRIFT', 'current prerelease base differs from the declared fixed-group bump');
    }
    if (preState.mode === 'exit') {
      return {
        current,
        bump: allBump,
        expected: base,
        preState,
        pendingIds: allChangesets.filter(({ file }) => !preState.changesets.includes(changesetId(file))).map(({ file }) => changesetId(file)),
        changesets: allChangesets.map(({ file, releases }) => ({
          file,
          types: [...new Set(releases.filter((r) => groupNames.includes(r.name)).map((r) => r.type))],
        })),
      };
    }
  }
  const bump = computeFixedGroupBump(changesets, groupNames);
  const expected = preState
    ? bump === null ? current : `${incrementVersion(initialVersion, computeFixedGroupBump(allChangesets, groupNames))}-${preState.tag}.${semver.test(current) ? 1 : Number(prerelease.exec(current)[5]) + 1}`
    : bump === null ? current : incrementVersion(current, bump);
  return {
    current,
    bump,
    expected,
    ...(preState ? { preState, pendingIds: changesets.map(({ file }) => changesetId(file)) } : {}),
    changesets: changesets.map(({ file, releases }) => ({
      file,
      types: [...new Set(releases.filter((r) => groupNames.includes(r.name)).map((r) => r.type))],
    })),
  };
}

function rewriteChangelog(source, packageNames, from, to, bump) {
  const heading = `## ${from}`;
  const lines = source.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) return { source, changed: false };
  let end = lines.findIndex((line, index) => index > start && /^## /u.test(line));
  if (end === -1) end = lines.length;
  const escapedFrom = from.replace(/\./gu, '\\.');
  const siblingLine = new RegExp(
    `^(\\s*-\\s*)(${packageNames.map((name) => name.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')).join('|')})@${escapedFrom}\\s*$`,
    'u',
  );
  lines[start] = `## ${to}`;
  const targetVersion = /^(\d+)\.(\d+)\.(\d+)/u.exec(to);
  const targetCategory = bump ?? (targetVersion?.[3] !== '0' ? 'patch' : targetVersion?.[2] !== '0' ? 'minor' : 'major');
  for (let index = start + 1; index < end; index += 1) {
    if (lines[index] === '### Major Changes' && targetCategory && targetCategory !== 'major') {
      lines[index] = `### ${targetCategory === 'minor' ? 'Minor' : 'Patch'} Changes`;
    }
    const match = siblingLine.exec(lines[index]);
    if (match) lines[index] = `${match[1]}${match[2]}@${to}`;
  }
  return { source: lines.join('\n'), changed: true };
}

export function applyFixedGroupVersion(repoRoot, { from, to, bump }) {
  if (from === to) return { manifests: 0, changelogs: 0 };
  const packages = collectPublicPackages(repoRoot);
  const packageNames = packages.map(({ manifest }) => manifest.name);
  let manifests = 0;
  let changelogs = 0;
  for (const { manifestPath, manifest } of packages) {
    if (manifest.version !== from) {
      fail(
        'VERSION_NOT_UNIFIED',
        `${manifest.name} is at ${manifest.version}, expected the generated ${from}`,
      );
    }
    manifest.version = to;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    manifests += 1;
    const changelogPath = resolve(manifestPath, '..', 'CHANGELOG.md');
    if (!existsSync(changelogPath)) continue;
    const result = rewriteChangelog(readFileSync(changelogPath, 'utf8'), packageNames, from, to, bump);
    if (result.changed) {
      writeFileSync(changelogPath, result.source);
      changelogs += 1;
    }
  }
  return { manifests, changelogs };
}
