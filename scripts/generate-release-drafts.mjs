import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishablePackageNames } from './lib/publishable-packages.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const statusPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(repoRoot, '.changeset/status.json');
const outDir = resolve(repoRoot, '.release/drafts');

if (!existsSync(statusPath)) {
  console.error(`Changeset status file not found: ${statusPath}`);
  process.exit(1);
}

const status = JSON.parse(readFileSync(statusPath, 'utf8'));
const publishablePackages = new Set(publishablePackageNames(repoRoot));

const releases = (Array.isArray(status.releases) ? status.releases : []).filter((release) =>
  publishablePackages.has(release.name),
);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const sanitize = (name) => name.replace(/^@/u, '').replace(/\//gu, '-');

for (const release of releases) {
  const lines = [
    `# ${release.name} ${release.newVersion}`,
    '',
    '## Summary',
    '',
    `- Previous version: \`${release.oldVersion}\``,
    `- Planned version: \`${release.newVersion}\``,
    `- Release type: \`${release.type}\``,
    '',
    '## Included changesets',
    '',
    ...(Array.isArray(release.changesets) && release.changesets.length > 0
      ? release.changesets.map((entry) => `- ${entry}`)
      : ['- No explicit changesets were attached.']),
    '',
    '## Publish notes',
    '',
    '- Changesets GitHub Releases should use this package/version pair as the release title.',
    '- Container signing and SBOM attachment are handled by the Prompt 37 release workflows.',
    '- Do not mark this draft as shipped until `docs/adopters/stynx/release-readiness.md` and the current release workflow evidence are green.',
    '',
  ];

  writeFileSync(resolve(outDir, `${sanitize(release.name)}.md`), lines.join('\n'));
}

writeFileSync(
  resolve(outDir, 'manifest.json'),
  `${JSON.stringify(
    {
      generatedFrom: statusPath.replace(`${repoRoot}/`, ''),
      releases: releases.map((release) => ({
        name: release.name,
        oldVersion: release.oldVersion,
        newVersion: release.newVersion,
        type: release.type,
        file: `${sanitize(release.name)}.md`,
      })),
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${releases.length} release draft notes and manifest in ${outDir}.`);
