import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(siteDir, '..');
const repoRoot = resolve(docsRoot, '..');
const outDir = resolve(docsRoot, '.generated/site-docs');

function resetOutDir() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
}

function titleFromName(name) {
  return name
    .replace(/^STYNX[- ]?/u, '')
    .replace(/\.[^.]+$/u, '')
    .replace(/[-_]/gu, ' ')
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

function sanitizeMdxContent(sourceText) {
  return sourceText
    .split(/(```[\s\S]*?```)/gu)
    .map((segment, index) => {
      if (index % 2 === 1) {
        return segment;
      }
      return segment
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/\{/gu, '&#123;')
        .replace(/\}/gu, '&#125;');
    })
    .join('');
}

function ensureFrontMatter(sourceText, title) {
  if (sourceText.startsWith('---\n')) {
    return sourceText;
  }
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${sourceText}`;
}

function writeDoc(relativeTarget, content, title) {
  const target = resolve(outDir, relativeTarget);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, ensureFrontMatter(content, title));
}

function copyMarkdownDir(sourceDir, targetDir) {
  if (!existsSync(sourceDir)) {
    return;
  }

  cpSync(sourceDir, resolve(outDir, targetDir), {
    recursive: true,
    filter: (src) => ['.md', '.mdx', ''].includes(extname(src)) || !extname(src),
  });
}

function copyMarkdownDirTransformed(sourceDir, targetDir, transform) {
  if (!existsSync(sourceDir)) {
    return;
  }

  const sourceRoot = resolve(sourceDir);
  const targetRoot = resolve(outDir, targetDir);
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true, recursive: true })) {
    const source = resolve(entry.parentPath, entry.name);
    const target = resolve(targetRoot, relative(sourceRoot, source));
    if (entry.isDirectory()) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    if (!entry.isFile() || !['.md', '.mdx'].includes(extname(entry.name))) {
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, transform(readFileSync(source, 'utf8'), relative(sourceRoot, source)));
  }
}

function rewriteGeneratedDocLinks(content) {
  return content
    .replace(/\]\(\.\.\/\.\.\/specs\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu, (_match, filename, hash = '') => {
      return `](/docs/specifications/${filename.toLowerCase()}${hash})`;
    })
    .replace(/\]\(\.\.\/\.\.\/docs\/templates\/package-README\.md((?:#[^)]+)?)\)/gu, '](/docs/templates/package-README$1)')
    .replace(/\]\(\.\.\/\.\.\/docs\/rfcs\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu, '](/docs/rfcs/$1$2)');
}

function rewritePackageReadmeLinks(content) {
  return rewriteGeneratedDocLinks(content);
}

function syncRfcContent(content, relativePath) {
  const slug = relativePath.replace(/\.mdx?$/u, '');
  const body = rewriteGeneratedDocLinks(content).replace(
    /\[Rationalization work\]\(\.\.\/work\/rationalization\/\)/gu,
    '`docs/work/rationalization/`',
  );
  if (body.startsWith('---\n')) {
    return body;
  }

  return `---\nslug: /rfcs/${slug}\n---\n\n${body}`;
}

function syncPackageReadmes(baseDir, targetDir, prefixMatcher) {
  const basePath = resolve(repoRoot, baseDir);
  for (const entry of readdirSync(basePath)) {
    const packageDir = resolve(basePath, entry);
    const manifestPath = resolve(packageDir, 'package.json');
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!prefixMatcher(manifest.name)) {
      continue;
    }
    const readmePath = resolve(packageDir, 'README.md');
    const title = `${manifest.name} ${manifest.description ? `- ${manifest.description}` : ''}`.trim();
    if (existsSync(readmePath)) {
      writeDoc(join(targetDir, `${entry}.md`), rewritePackageReadmeLinks(readFileSync(readmePath, 'utf8')), manifest.name);
      continue;
    }
    writeDoc(
      join(targetDir, `${entry}.md`),
      `# ${manifest.name}\n\n${manifest.description ?? 'No README has been authored for this package yet.'}\n\n- Package path: \`${relative(repoRoot, packageDir)}\`\n- Version: \`${manifest.version}\`\n`,
      manifest.name,
    );
  }
}

function syncSpecs() {
  const specsDir = resolve(repoRoot, 'specs');
  const entries = readdirSync(specsDir);

  for (const entry of entries) {
    const source = resolve(specsDir, entry);
    if (entry === 'STYNX-ADOPT-EXAMPLE.md') {
      writeDoc('adoption-guide.md', sanitizeMdxContent(readFileSync(source, 'utf8')), 'Adoption Guide');
      continue;
    }
    if (entry === 'STYNX-CDK-SKELETON.md') {
      writeDoc('infrastructure-guide.md', sanitizeMdxContent(readFileSync(source, 'utf8')), 'Infrastructure Guide');
      continue;
    }
    if (/^STYNX-ADR-/u.test(entry)) {
      writeDoc(
        join('architecture-decisions', entry.toLowerCase().replace(/\.md$/u, '.md')),
        sanitizeMdxContent(readFileSync(source, 'utf8')),
        titleFromName(entry),
      );
      continue;
    }
    if (entry.endsWith('.md')) {
      writeDoc(join('specifications', entry.toLowerCase()), sanitizeMdxContent(readFileSync(source, 'utf8')), titleFromName(entry));
      continue;
    }
    if (entry.endsWith('.sql')) {
      const sql = readFileSync(source, 'utf8');
      writeDoc(
        join('specifications', entry.toLowerCase().replace(/\.sql$/u, '.md')),
        `# ${titleFromName(entry)}\n\n\`\`\`sql\n${sql}\n\`\`\`\n`,
        titleFromName(entry),
      );
    }
  }
}

resetOutDir();
writeDoc('packages/index.md', '# Packages\n\nNarrative package documentation aggregated from each `README.md` or package manifest.\n', 'Packages');
writeDoc('packages-web/index.md', '# Web Packages\n\nNarrative Angular and SDK package documentation.\n', 'Web Packages');
writeDoc('specifications/index.md', '# Specifications\n\nNormative and reference documents mirrored from `specs/`.\n', 'Specifications');
writeDoc('architecture-decisions/index.md', '# Architecture Decisions\n\nArchitecture Decision Records mirrored from `specs/`.\n', 'Architecture Decisions');
writeDoc('api-reference/index.md', '# API Reference\n\nGenerated API reference for every `@stynx/*` and `@stynx-web/*` package.\n', 'API Reference');
writeDoc('templates/index.md', '# Templates\n\nDocumentation templates mirrored from `docs/templates/`.\n', 'Templates');
writeDoc('rfcs/index.md', '# RFCs\n\nRepository RFCs mirrored from `docs/rfcs/`.\n', 'RFCs');

copyMarkdownDir(resolve(repoRoot, 'docs/dev'), 'narrative/dev');
copyMarkdownDir(resolve(repoRoot, 'docs/sys'), 'narrative/system');
copyMarkdownDir(resolve(repoRoot, 'docs/user'), 'narrative/user');
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/stynx'), 'narrative/stynx', (content) =>
  rewriteGeneratedDocLinks(sanitizeMdxContent(content)),
);
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/templates'), 'templates', (content) => rewriteGeneratedDocLinks(sanitizeMdxContent(content)));
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/rfcs'), 'rfcs', syncRfcContent);
syncPackageReadmes('packages', 'packages', (name) => typeof name === 'string' && name.startsWith('@stynx/'));
syncPackageReadmes('packages-web', 'packages-web', (name) => typeof name === 'string' && name.startsWith('@stynx-web/'));
syncSpecs();
