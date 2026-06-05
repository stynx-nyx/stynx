import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, '..');
const repoRoot = resolve(siteRoot, '..', '..');
const outDir = resolve(siteRoot, '.generated/site-docs');

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

function writeReadmeDoc(sourcePath, relativeTarget, transform, title) {
  if (!existsSync(sourcePath)) {
    return;
  }
  writeDoc(relativeTarget, transform(readFileSync(sourcePath, 'utf8'), 'README.md'), title);
}

function writeSpecificDoc(sourcePath, relativeTarget, title) {
  writeReadmeDoc(sourcePath, relativeTarget, (content) => publicMarkdownContent(content), title);
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

function isTrackedFile(filePath) {
  const relativePath = relative(repoRoot, filePath).split('\\').join('/');
  const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function sanitizePublicReferences(content) {
  return content
    .replace(/`docs\/work\/[^`]*`/gu, '`internal work note (not published)`')
    .replace(/\bdocs\/work\/[^\s),.;]*/gu, 'internal work note')
    .replace(/`\.devai\/state\/[^`]*`/gu, '`internal DEVAI state artifact (not published)`')
    .replace(/\.devai\/state\/[^\s`'",)]+/gu, 'internal DEVAI state artifact')
    .replace(/`\.ci\/evidence\/[^`]*`/gu, '`internal CI evidence artifact (not published)`')
    .replace(/\.ci\/evidence\/[^\s`'",)]+/gu, 'internal CI evidence artifact')
    .replace(/`coverage\/test-evidence\.json`/gu, '`generated test evidence summary (not published)`')
    .replace(/coverage\/test-evidence\.json/gu, 'generated test evidence summary')
    .replace(/`coverage-final\.json`/gu, '`coverage summary JSON (not published)`')
    .replace(/coverage-final\.json/gu, 'coverage summary JSON')
    .replace(/\]\((?:\.\.\/)+align\/[^)]*\)/gu, '](#internal-round-tracking-note)')
    .replace(/`(?:\.\.\/)*align\/[^`]*`/gu, '`internal round-tracking note (not published)`')
    .replace(/\balign\/stynx\/[^\s`'",)]+/gu, 'internal round-tracking note')
    .replace(/\]\((?:\.\.\/)+devai\/[^)]*\)/gu, '](#external-devai-reference)')
    .replace(/`(?:\.\.\/)*devai\/[^`]*`/gu, '`external DEVAI sibling checkout reference (not published)`');
}

function publicMarkdownContent(content) {
  return sanitizePublicReferences(rewriteGeneratedDocLinks(sanitizeMdxContent(content)));
}

function rewriteGeneratedDocLinks(content) {
  return content
    .replace(/\]\(\.\.\/arch\/invariants\/?\)/gu, '](/docs/framework/arch/invariants)')
    .replace(/\]\(\.\.\/arch\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/arch$1)')
    .replace(
      /\]\(\.\.\/arch\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu,
      (_match, filename, hash = '') => `](/docs/framework/arch/${filename}${hash})`,
    )
    .replace(/\]\(\.\.\/adr\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu, '](/docs/meta/adr/$1$2)')
    .replace(/\]\(\.\.\/contracts\/?\)/gu, '](/docs/contracts)')
    .replace(/\]\(\.\.\/contracts\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/contracts$1)')
    .replace(/\]\(\.\.\/security\/?\)/gu, '](/docs/security)')
    .replace(/\]\(\.\.\/security\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/security$1)')
    .replace(/\]\(\.\.\/ops\/?\)/gu, '](/docs/ops)')
    .replace(/\]\(\.\.\/ops\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/ops$1)')
    .replace(
      /\]\(\.\.\/stynx\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu,
      (_match, filename, hash = '') => `](/docs/narrative/stynx/${filename}${hash})`,
    )
    .replace(/\]\(\.\.\/templates\/package-README\.md((?:#[^)]+)?)\)/gu, '](/docs/meta/templates/package-README$1)')
    .replace(/\]\(\.\.\/\.\.\/specs\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu, (_match, filename, hash = '') => {
      return `](/docs/specifications/${filename.toLowerCase()}${hash})`;
    })
    .replace(/\]\(\.\.\/\.\.\/docs\/arch\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/arch$1)')
    .replace(
      /\]\(\.\.\/\.\.\/docs\/arch\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu,
      (_match, filename, hash = '') => `](/docs/framework/arch/${filename}${hash})`,
    )
    .replace(/\]\(\.\.\/\.\.\/docs\/contracts\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/contracts$1)')
    .replace(
      /\]\(\.\.\/\.\.\/docs\/contracts\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu,
      (_match, filename, hash = '') => `](/docs/framework/contracts/${filename}${hash})`,
    )
    .replace(/\]\(\.\.\/\.\.\/docs\/security\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/security$1)')
    .replace(
      /\]\(\.\.\/\.\.\/docs\/security\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu,
      (_match, filename, hash = '') => `](/docs/meta/security/${filename}${hash})`,
    )
    .replace(/\]\(\.\.\/\.\.\/docs\/glossary\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/glossary$1)')
    .replace(
      /\]\(\.\.\/\.\.\/docs\/glossary\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu,
      (_match, filename, hash = '') => `](/docs/framework/glossary/${filename}${hash})`,
    )
    .replace(/\]\(\.\.\/\.\.\/docs\/ops\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/ops$1)')
    .replace(
      /\]\(\.\.\/\.\.\/docs\/ops\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu,
      (_match, filename, hash = '') => `](/docs/meta/ops/${filename}${hash})`,
    )
    .replace(
      /\]\(\.\.\/\.\.\/docs\/stynx\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu,
      (_match, filename, hash = '') => `](/docs/narrative/stynx/${filename}${hash})`,
    )
    .replace(/\]\(\.\.\/\.\.\/docs\/templates\/package-README\.md((?:#[^)]+)?)\)/gu, '](/docs/meta/templates/package-README$1)')
    .replace(/\]\(\.\.\/\.\.\/docs\/rfcs\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu, '](/docs/meta/rfcs/$1$2)')
    .replace(/\]\(\.\.\/adopters\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu, '](/docs/adopters/$1$2)')
    .replace(/\]\(\.\.\/\.\.\/docs\/adopters\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu, '](/docs/adopters/$1$2)')
    .replace(/\]\(\.\.\/\.\.\/CONTRIBUTING\.md((?:#[^)]+)?)\)/gu, '](/docs/contributing$1)')
    .replace(
      /\]\(\.\.\/\.\.\/packages\/([^)\s/#]+)\/README\.md((?:#[^)]+)?)\)/gu,
      (_match, packageDir, hash = '') => `](/docs/packages/${packageDir}${hash})`,
    )
    .replace(
      /\]\(\.\.\/\.\.\/packages-web\/([^)\s/#]+)\/README\.md((?:#[^)]+)?)\)/gu,
      (_match, packageDir, hash = '') => `](/docs/packages-web/${packageDir}${hash})`,
    )
    .replace(/\[`@stynx\/pdf-a`\]\(\/docs\/packages\/pdf-a\)/gu, '`@stynx/pdf-a`')
    .replace(/\[`@stynx\/pdf-a-vera-docker`\]\(\/docs\/packages\/pdf-a-vera-docker\)/gu, '`@stynx/pdf-a-vera-docker`')
    .replace(/\]\(porm-flow-deprecation-readiness\.md((?:#[^)]+)?)\)/gu, '](./porm-flow-deprecation-readiness$1)');
}

function rewritePackageReadmeLinks(content, targetDir) {
  const updated = rewriteGeneratedDocLinks(content)
    .replace(/\]\(\.\.\/([^)\s/#]+)\/README\.md((?:#[^)]+)?)\)/gu, (_match, packageDir, hash = '') => {
      return `](/docs/${targetDir}/${packageDir}${hash})`;
    })
    .replace(/\]\(\.\.\/\.\.\/packages-web\/([^)\s/#]+)\/README\.md((?:#[^)]+)?)\)/gu, (_match, packageDir, hash = '') => {
      return `](/docs/packages-web/${packageDir}${hash})`;
    })
    .replace(/\]\(\.\.\/\.\.\/packages\/([^)\s/#]+)\/README\.md((?:#[^)]+)?)\)/gu, (_match, packageDir, hash = '') => {
      return `](/docs/packages/${packageDir}${hash})`;
    })
    .replace(/\]\(\.\.\/\.\.\/reference\/web\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/reference/web$1)')
    .replace(/\]\(\.\.\/\.\.\/reference\/api\/README\.md((?:#[^)]+)?)\)/gu, '](/docs/reference/api$1)');
  return sanitizePublicReferences(updated);
}

function syncRfcContent(content, relativePath) {
  const slug = relativePath.replace(/\.mdx?$/u, '');
  const body = sanitizePublicReferences(rewriteGeneratedDocLinks(sanitizeMdxContent(content))
    .replace(
      /\]\(\.\.\/legacy\/completed-gap-tasks\/([^)\s#]+)\.md((?:#[^)]+)?)\)/gu,
      (_match, filename, hash = '') => `](/docs/meta/legacy/completed-gap-tasks/${filename}${hash})`,
    )
    .replace(
      /\[Rationalization work\]\(\.\.\/work\/rationalization\/\)/gu,
      'internal rationalization notes',
    ));
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
    if (!existsSync(manifestPath) || !isTrackedFile(manifestPath)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!prefixMatcher(manifest.name)) {
      continue;
    }
    const readmePath = resolve(packageDir, 'README.md');
    const title = `${manifest.name} ${manifest.description ? `- ${manifest.description}` : ''}`.trim();
    if (existsSync(readmePath)) {
      writeDoc(join(targetDir, `${entry}.md`), rewritePackageReadmeLinks(sanitizeMdxContent(readFileSync(readmePath, 'utf8')), targetDir), manifest.name);
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
  if (!existsSync(specsDir)) {
    const fallbackDocs = [
      {
        source: resolve(repoRoot, 'docs/meta/dev/STYNX-ADOPT-EXAMPLE.md'),
        target: 'adoption-guide.md',
        title: 'Adoption Guide',
      },
      {
        source: resolve(repoRoot, 'docs/framework/arch/STYNX-CDK-SKELETON.md'),
        target: 'infrastructure-guide.md',
        title: 'Infrastructure Guide',
      },
      {
        source: resolve(repoRoot, 'docs/framework/arch/STYNX-SPEC-v0.6.md'),
        target: 'specifications/stynx-spec-v0.6.md',
        title: 'Stynx Spec v0.6',
      },
    ];
    for (const doc of fallbackDocs) {
      if (existsSync(doc.source)) {
        writeDoc(doc.target, publicMarkdownContent(readFileSync(doc.source, 'utf8')), doc.title);
      }
    }
    return;
  }
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
        publicMarkdownContent(readFileSync(source, 'utf8')),
        titleFromName(entry),
      );
      continue;
    }
    if (entry.endsWith('.md')) {
      writeDoc(join('specifications', entry.toLowerCase()), publicMarkdownContent(readFileSync(source, 'utf8')), titleFromName(entry));
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

function syncPublicStynxDocs() {
  writeDoc(
    'narrative/stynx/index.md',
    '# STYNX Project Status\n\nCurated public project, readiness, and adoption documents.\n',
    'STYNX Project Status',
  );

  const docs = [
    ['consumer-adoption-guide.md', 'narrative/stynx/consumer-adoption-guide.md', 'Consumer Adoption Guide'],
    ['feature-coverage-status.md', 'narrative/stynx/feature-coverage-status.md', 'Feature Coverage Status'],
    ['implementation-status.md', 'narrative/stynx/implementation-status.md', 'Implementation Status'],
    ['package-architecture.md', 'narrative/stynx/package-architecture.md', 'Package Architecture'],
    ['porm-flow-deprecation-readiness.md', 'narrative/stynx/porm-flow-deprecation-readiness.md', 'PORM Flow Deprecation Readiness'],
    ['release-readiness.md', 'narrative/stynx/release-readiness.md', 'Release Readiness'],
  ];

  for (const [sourceName, target, title] of docs) {
    writeSpecificDoc(resolve(repoRoot, 'docs/stynx', sourceName), target, title);
  }
}

function generateStatusPages() {
  const result = spawnSync(process.execPath, [resolve(siteRoot, 'scripts/generate-status-pages.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error('Status page generation failed');
  }
}

resetOutDir();
writeDoc('packages/index.md', '# Packages\n\nNarrative package documentation aggregated from each `README.md` or package manifest.\n', 'Packages');
writeDoc('packages-web/index.md', '# Web Packages\n\nNarrative Angular and SDK package documentation.\n', 'Web Packages');
writeDoc('tools/index.md', '# Tools\n\nInternal workspace tooling published under `@stynx-internal/*`: the scaffolder, shared ESLint config, migration linter, and TS config.\n', 'Tools');
writeDoc('specifications/index.md', '# Specifications\n\nNormative and reference documents mirrored from `specs/` when that source directory is present.\n', 'Specifications');
writeDoc('architecture-decisions/index.md', '# Architecture Decisions\n\nArchitecture Decision Records mirrored from `specs/` when that source directory is present.\n', 'Architecture Decisions');
writeDoc('api-reference/index.md', '# API Reference\n\nGenerated API reference for every `@stynx/*` and `@stynx-web/*` package.\n', 'API Reference');
writeDoc('templates/index.md', '# Templates\n\nDocumentation templates mirrored from `docs/meta/templates/`.\n', 'Templates');
writeDoc('rfcs/index.md', '# RFCs\n\nRepository RFCs mirrored for public cross-reference stability.\n', 'RFCs');

copyMarkdownDirTransformed(resolve(repoRoot, 'docs/adopters'), 'adopters', (content) =>
  publicMarkdownContent(content),
);
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/dev'), 'narrative/dev', (content) => publicMarkdownContent(content));
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/meta/legacy/completed-gap-tasks'), 'legacy/completed-gap-tasks', (content) =>
  publicMarkdownContent(content),
);
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/sys'), 'narrative/system', (content) => publicMarkdownContent(content));
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/user'), 'narrative/user', (content) => publicMarkdownContent(content));
writeSpecificDoc(resolve(repoRoot, 'CONTRIBUTING.md'), 'contributing.md', 'Contributing');
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/arch'), 'arch', (content) =>
  publicMarkdownContent(content),
);
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/contracts'), 'contracts', (content) =>
  publicMarkdownContent(content),
);
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/security'), 'security', (content) =>
  publicMarkdownContent(content),
);
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/glossary'), 'glossary', (content) =>
  publicMarkdownContent(content),
);
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/ops'), 'ops', (content) =>
  publicMarkdownContent(content),
);
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/adr'), 'adr', (content) =>
  publicMarkdownContent(content),
);
syncPublicStynxDocs();
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/templates'), 'templates', (content) => publicMarkdownContent(content));
copyMarkdownDirTransformed(resolve(repoRoot, 'docs/rfcs'), 'rfcs', syncRfcContent);
writeReadmeDoc(resolve(repoRoot, 'reference/api/README.md'), 'reference/api.md', (content) =>
  publicMarkdownContent(content)
    .replace(/\[([^\]]+)\]\(\.\.\/\.\.\/specs\/([^)\s#]+)\.sql(?:#[^)]+)?\)/gu, (_match, label, filename) => {
      return `\`${label || `specs/${filename}.sql`}\``;
    }),
  'Reference API',
);
writeReadmeDoc(resolve(repoRoot, 'reference/web/README.md'), 'reference/web.md', (content) =>
  rewritePackageReadmeLinks(sanitizeMdxContent(content), 'packages-web'),
  'Reference Web',
);
syncPackageReadmes('packages', 'packages', (name) => typeof name === 'string' && name.startsWith('@stynx/'));
syncPackageReadmes('packages-web', 'packages-web', (name) => typeof name === 'string' && name.startsWith('@stynx-web/'));
// R15 follow-up: surface tool packages on the published site. All current
// tools live under @stynx-internal/* (create-stynx-app, eslint-config,
// migration-linter, tsconfig). Internal scripts without a package.json
// (ci-local, repo-config, stryker, npm-security-upgrade-auditor) are
// intentionally skipped — they're not published packages.
syncPackageReadmes(
  'tools',
  'tools',
  (name) => typeof name === 'string' && name.startsWith('@stynx-internal/'),
);
syncSpecs();
generateStatusPages();

// R15 W06 — IA-section mirror: walk the 0.2.0 section dirs (post-W03 reorg)
// and copy markdown directly into matching section roots under .generated/site-docs/.
// This is additive — the legacy mirror logic above stays in place for backwards URL
// stability; the IA mirror exists so the hand-authored 7-section sidebar in
// docs/site/sidebars.js can autogenerate from real content under each section.
//
// Source layout (post-W03): docs/{start,theory,framework,roles,adopters,reference,meta}/
// Target layout: .generated/site-docs/{start,theory,framework,roles,adopters,reference,meta}/
//
// Section dirs without content are tolerated (Docusaurus only errors on empty
// sidebar categories, not on missing section dirs; the sidebar gracefully
// handles empty `autogenerated` items when the dirName has at least an index).
for (const section of ['start', 'theory', 'framework', 'roles', 'adopters', 'reference', 'meta']) {
  copyMarkdownDirTransformed(
    resolve(repoRoot, 'docs', section),
    section,
    (content) => publicMarkdownContent(content),
  );
}
