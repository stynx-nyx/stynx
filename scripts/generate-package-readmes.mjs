import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverPublishablePackages } from './lib/publishable-packages.mjs';

const startMarker = '<!-- stynx:generated-dependencies:start -->';
const endMarker = '<!-- stynx:generated-dependencies:end -->';
const dependencySections = [
  ['dependencies', 'Runtime dependencies'],
  ['optionalDependencies', 'Optional dependencies'],
  ['peerDependencies', 'Peer dependencies'],
  ['devDependencies', 'Development-only dependencies'],
];
const handwrittenDependencyHeading =
  /^\s*(?:#{1,6}\s+)?(?:\*\*)?(?:dependencies|no(?: runtime)? peer dependencies|peer dependencies|runtime dependencies|optional dependencies|development-only dependencies)(?::|\.|\*\*:)/iu;

function handwrittenDependencyProse(current) {
  const start = current.indexOf(startMarker);
  const end = current.indexOf(endMarker);
  const outsideGeneratedSection =
    start === -1 || end === -1
      ? current
      : `${current.slice(0, start)}${current.slice(end + endMarker.length)}`;
  return outsideGeneratedSection
    .split('\n')
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => handwrittenDependencyHeading.test(line));
}

function renderDependencies(manifest) {
  const sections = dependencySections.map(([key, title]) => {
    const dependencies = Object.entries(manifest[key] ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const rows =
      dependencies.length === 0
        ? ['_None._']
        : dependencies.map(([name, range]) => `- \`${name}\`: \`${range}\``);
    return `### ${title}\n\n${rows.join('\n')}`;
  });
  return [
    startMarker,
    '',
    '## Generated dependency reference',
    '',
    'This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.',
    '',
    ...sections.flatMap((section, index) => (index === 0 ? [section] : ['', section])),
    '',
    endMarker,
  ].join('\n');
}

function expectedReadme(current, manifest) {
  const generated = renderDependencies(manifest);
  const start = current.indexOf(startMarker);
  const end = current.indexOf(endMarker);
  if (
    (start === -1) !== (end === -1) ||
    (start !== -1 && current.indexOf(startMarker, start + 1) !== -1)
  ) {
    throw new Error(`${manifest.name}: malformed or duplicate generated dependency markers`);
  }
  if (start === -1) {
    const prefix = current.trimEnd() || `# ${manifest.name}`;
    return `${prefix}\n\n${generated}\n`;
  }
  if (end < start) throw new Error(`${manifest.name}: generated dependency markers are reversed`);
  return `${current.slice(0, start)}${generated}${current.slice(end + endMarker.length)}`;
}

export function syncPackageReadmes(repoRoot, mode) {
  const packages = discoverPublishablePackages(repoRoot);
  const stale = [];
  for (const { dirPath, manifest } of packages) {
    const path = resolve(dirPath, 'README.md');
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const handwritten = handwrittenDependencyProse(current);
    if (mode === 'check' && handwritten.length > 0) {
      throw new Error(
        `${relative(repoRoot, path)} contains hand-written dependency prose outside the generated markers:\n${handwritten
          .map(({ lineNumber, line }) => `- line ${lineNumber}: ${line.trim()}`)
          .join('\n')}`,
      );
    }
    const expected = expectedReadme(current, manifest);
    if (current === expected) continue;
    stale.push(relative(repoRoot, path));
    if (mode === 'write') writeFileSync(path, expected);
  }
  if (mode === 'check' && stale.length > 0) {
    throw new Error(
      `generated package README dependency sections are stale:\n- ${stale.join('\n- ')}`,
    );
  }
  return { packageCount: packages.length, changedFiles: stale.length };
}

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mode = process.argv.includes('--write')
  ? 'write'
  : process.argv.includes('--check')
    ? 'check'
    : null;
if (!mode) {
  process.stderr.write('usage: node scripts/generate-package-readmes.mjs --write|--check\n');
  process.exit(1);
}
try {
  const result = syncPackageReadmes(repoRoot, mode);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
