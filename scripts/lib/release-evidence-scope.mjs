import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalize } from './mutation-roster.mjs';
import { discoverPublishablePackages } from './publishable-packages.mjs';

const schemaPath = 'law/schemas/release-scope-1.6.0.schema.json';
const schemaSha256 = 'd9041edc1e883361bd89fa9973bcb7377c539d0445225fc460b1c10aa7dad298';
const taskDescriptorSha256 = 'da6e68962024d81f27d0a022505501b202db0eb3bb3d79890bd9943a767aa6cc';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function invalid(message) {
  throw new Error(`STYNX_RELEASE_SCOPE_INVALID: ${message}`);
}

// The digest-bound closed schema contains constants only. Reconstruct its one
// admitted value without adding an undeclared schema runtime dependency.
function constantValue(schema) {
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (
    schema.type !== 'object' ||
    schema.additionalProperties !== false ||
    canonicalize([...schema.required].sort()) !==
      canonicalize(Object.keys(schema.properties).sort())
  )
    invalid('schema is not closed');
  return Object.fromEntries(
    Object.entries(schema.properties).map(([key, value]) => [key, constantValue(value)]),
  );
}

/** Select the expressly scoped 1.6.0 rule, retaining k6 for every other version. */
export function resolvePublicationEvidenceRequirements(repoRoot) {
  const json = (path) => JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'));
  if (json('package.json').version !== '1.6.0') {
    return { scope: null, requiredChecks: [['k6', 'hardening scenario=all']] };
  }
  const schemaBytes = readFileSync(resolve(repoRoot, schemaPath));
  if (digest(schemaBytes) !== schemaSha256) invalid('schema identity changed');
  const expected = constantValue(JSON.parse(schemaBytes.toString('utf8')));
  const scope = json('law/policy/release-scope-1.6.0.json');
  if (canonicalize(scope) !== canonicalize(expected)) invalid('policy differs from closed schema');
  const rosterBytes = readFileSync(resolve(repoRoot, scope.packageRoster.path));
  if (digest(rosterBytes) !== scope.packageRoster.sha256)
    invalid('package roster identity changed');
  const roster = JSON.parse(rosterBytes.toString('utf8')).publishable_packages;
  const packages = discoverPublishablePackages(repoRoot);
  if (
    packages.length !== scope.packageRoster.count ||
    canonicalize(packages.map((entry) => entry.name)) !== canonicalize(roster) ||
    packages.some((entry) => entry.manifest.version !== scope.version)
  )
    invalid('fixed-group version or package population differs');
  const descriptorBytes = readFileSync(resolve(repoRoot, 'test-tasks.json'));
  if (digest(descriptorBytes) !== taskDescriptorSha256)
    invalid('reviewed task commands or execution controls changed');
  const descriptor = JSON.parse(descriptorBytes.toString('utf8'));
  const profile = descriptor.profiles.find((entry) => entry.profileId === scope.rc.profile);
  if (!profile || profile.mode !== 'fixed') invalid('fixed RC profile missing');
  const byId = new Map(descriptor.tasks.map((task) => [task.nodeId, task]));
  if (byId.size !== descriptor.tasks.length) invalid('duplicate task');
  const selected = new Set();
  const queue = [...profile.requiredNodes];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    if (selected.has(id)) continue;
    const task = byId.get(id);
    if (!task) invalid('missing RC task');
    selected.add(id);
    queue.push(...task.dependencies);
  }
  if (canonicalize([...selected].sort()) !== canonicalize([...scope.rc.requiredNodes].sort()))
    invalid('RC closure differs from the retained 15-node population');
  return {
    scope,
    requiredChecks: [[scope.rc.requiredCheck, 'signed exact-candidate local RC']],
  };
}
