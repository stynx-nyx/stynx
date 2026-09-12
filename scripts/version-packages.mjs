#!/usr/bin/env node
// Versions the STYNX release unit under the fixed-group version rule.
//
//   node scripts/version-packages.mjs            consume changesets and version
//   node scripts/version-packages.mjs --preview  print the plan, write nothing
//
// The plan is computed from the pending changesets *before* `changeset version`
// runs, then the generated result is corrected wherever Changesets' peer
// inference over-promoted the fixed group (see lib/fixed-group-version.mjs).
// Root manifest, internal ranges, the create-stynx-app template and the SBOM
// are synchronized afterwards exactly as before.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  applyFixedGroupVersion,
  planFixedGroupVersion,
  unifiedVersion,
} from './lib/fixed-group-version.mjs';
import { syncReleaseVersion, validateReleaseVersionPolicy } from './lib/release-version-policy.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const preview = process.argv.includes('--preview');
const changesetConfig = JSON.parse(
  readFileSync(resolve(repoRoot, '.changeset/config.json'), 'utf8'),
);

const plan = planFixedGroupVersion(repoRoot, changesetConfig);
const describe = (entry) => `${entry.file} (${entry.types.join(', ') || 'no group release'})`;

if (plan.changesets.length === 0) {
  console.log(
    `[version-packages] no pending changesets; the release unit stays at ${plan.current}.`,
  );
  process.exit(0);
}

console.log(
  `[version-packages] ${plan.changesets.length} pending changeset(s): ${plan.changesets.map(describe).join('; ')}`,
);
console.log(
  `[version-packages] fixed-group bump: ${plan.bump ?? 'none'}; ${plan.current} -> ${plan.expected}`,
);

if (preview) {
  process.exit(0);
}

run('pnpm', ['exec', 'changeset', 'version']);

const generated = unifiedVersion(repoRoot);
if (generated !== plan.expected) {
  const { manifests, changelogs } = applyFixedGroupVersion(repoRoot, {
    from: generated,
    to: plan.expected,
  });
  console.log(
    `[version-packages] changeset version produced ${generated}; rewrote ${manifests} manifests and ${changelogs} changelogs to the fixed-group version ${plan.expected}.`,
  );
}

const synchronized = syncReleaseVersion(repoRoot);
console.log(
  `[version-packages] synchronized root and ${synchronized.packageCount} public packages at ${synchronized.version}.`,
);
const errors = validateReleaseVersionPolicy(repoRoot, changesetConfig, {
  expectedVersion: plan.expected,
});
if (errors.length > 0) {
  console.error('[version-packages] release version policy failed after versioning:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

run('pnpm', ['security:sbom']);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[version-packages] ${command} ${args.join(' ')} failed`);
    process.exit(result.status ?? 1);
  }
}
