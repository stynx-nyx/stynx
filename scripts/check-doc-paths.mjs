#!/usr/bin/env node
// check-doc-paths — fail when tracked markdown cites a repository path that
// does not exist.
//
// Two kinds of citation are checked, both outside fenced code blocks:
//
//   1. Inline code spans that name a repository path: the span is a single
//      token that starts with one of PATH_ROOTS followed by `/`, for example
//      `packages/data/README.md` or `docs/adopters/stynx/`.
//   2. Relative markdown links and reference definitions, for example
//      `[guide](../meta/development-contract.md)`.
//
// A citation resolves when the path exists relative to the repository root,
// to the citing file's directory, or to the nearest enclosing workspace
// package (the directory holding the closest `package.json`). Globs and brace
// lists (`reference/{api,web}/`, `packages/*/CHANGELOG.md`) resolve when at
// least one expansion exists. An inline code path without a file extension
// also resolves as a module specifier when the same path with a source
// extension exists (`packages/data/test/support/postgres`). Trailing `:line`, `:from-to`, `#anchor` and
// `?query` suffixes are ignored.
//
// An inline code span also resolves as workspace submodule shorthand:
// `<package dir>/<name>` names `packages/<package dir>/src/<name>` (or the
// `packages-web` equivalent), which is how the `@stynx-nyx/backend` docs name
// submodules such as `backend/audit`. The shorthand is accepted only when
// that source directory or file exists.
//
// What is deliberately not checked:
//
//   - Spans with placeholders or shell syntax (`<pkg>`, `{env}`, `$VAR`,
//     `...`, whitespace): they are templates or commands, not citations. A
//     brace group counts as a placeholder when it has no comma.
//   - `.changeset/*.md` files: `changeset version` deletes them when a
//     release consumes them, so a citation cannot stay live by design.
//   - Paths matched by `.gitignore` (build output such as `dist/`,
//     `coverage/`, `docs/site/build/`): they exist only after a build.
//   - Inline code used as the label of a markdown link, as in
//     [`backend/audit`](/docs/packages/backend/audit/): the label is display
//     text and the link target is what gets checked.
//   - Links with a URL scheme, pure `#anchor` links, and site-absolute links
//     starting with `/` (the Docusaurus build validates those routes).
//   - Links in SITE_ROUTE_PAGES: Docusaurus pages whose relative links are
//     site routes, not files; the Docusaurus build fails on broken routes.
//   - Files listed in HISTORICAL_RECORDS: dated records that must keep the
//     paths that were true when they were written.
//   - The exact (file, path) pairs in HISTORICAL_CITATIONS: live documents
//     that name a removed path on purpose, for example a migration note.
//
// Both lists are checked for staleness: a HISTORICAL_RECORDS glob that matches
// no tracked file, or a HISTORICAL_CITATIONS pair that no longer excuses a
// dead citation, fails the check so the lists cannot outlive their reason.
//
// Usage:
//   node scripts/check-doc-paths.mjs             # check, exit 1 on dead paths
//   node scripts/check-doc-paths.mjs --json      # machine-readable findings
//   node scripts/check-doc-paths.mjs --self-test # run the built-in fixtures
//
// Exit codes: 0 clean, 1 dead citations or failed self-test, 2 internal error.

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';

// First path segments that mark an inline code span as a repository path.
// The list holds the current top-level trees plus the retired ones
// (`backend`, `frontend`, `bootstrap`, `apps`, `align`) so that citations of
// removed trees are still recognized as paths and reported.
export const PATH_ROOTS = [
  '.devai',
  '.github',
  '.husky',
  'align',
  'apps',
  'backend',
  'bootstrap',
  'database',
  'docs',
  'domain',
  'frontend',
  'infra',
  'law',
  'packages',
  'packages-web',
  'product',
  'record',
  'reference',
  'scripts',
  'test',
  'tools',
  'work',
];

// Historical records: excluded as citing files. Every entry needs a reason.
export const HISTORICAL_RECORDS = [
  { glob: 'law/adr/**', reason: 'ADRs are immutable decision records of their date' },
  { glob: 'work/**', reason: 'round and campaign work records' },
  { glob: '.devai/**', reason: 'pinned or materialized DEVAI content, never hand-edited' },
  { glob: 'record/**', reason: 'machine-written proofs and derived records' },
  { glob: 'docs/meta/migration/**', reason: 'dated migration records' },
  { glob: 'MUTATION_AUDIT_2026-05-19.md', reason: 'dated audit report' },
  { glob: '**/CHANGELOG.md', reason: 'release history; entries describe the tree at release time' },
  { glob: 'docs/meta/rfcs/**', reason: 'RFCs are proposals of their date, like ADRs' },
  { glob: 'docs/meta/ops/release-dry-run-2026-06.md', reason: 'dated dry-run report (R19 W03)' },
  {
    glob: 'docs/meta/ops/vitest-parallel-adoption.md',
    reason: 'Jest-to-Vitest adoption log; its header dates the content to 2026-05-18',
  },
  {
    glob: 'docs/adopters/stynx-r10-closeout.md',
    reason: 'R10 closeout note; cites SGP repository paths',
  },
  {
    glob: 'docs/adopters/stynx/porting-pack/_PROMPTS/**',
    reason: 'verbatim prompts that generated the porting pack (provenance)',
  },
  {
    glob: 'docs/adopters/stynx/porting-pack/_GENERATION-PLAN.md',
    reason: 'generation plan of the porting pack (provenance)',
  },
  {
    glob: 'docs/adopters/stynx/porting-pack/_DISCOVERY.md',
    reason: 'discovery notes pinned to commit 670d1652 of 2026-04-27 (provenance)',
  },
];

// Docusaurus pages whose relative links are routes of the built site.
export const SITE_ROUTE_PAGES = [
  { glob: 'docs/site/src/pages/**', reason: 'links are site routes' },
];

// Live documents that cite a removed path on purpose. Keep this list short
// and exact; a new entry must say why the dead path is the point of the text.
export const HISTORICAL_CITATIONS = [
  {
    file: 'docs/adopters/stynx/porting-pack/10-INFRASTRUCTURE-REQUIREMENTS.md',
    path: 'infra/cdk/dashboards',
    reason: 'listed as something the adopter must still provide',
  },
  {
    file: 'docs/adopters/stynx/porting-pack/13-COMMON-PITFALLS.md',
    path: 'docs/meta/ops/runbooks/cognito-cutover.md',
    reason: 'named as a runbook that does not exist yet (FIND-031)',
  },
  {
    file: 'docs/adopters/stynx/porting-pack/18-GAPS-AND-OPEN-QUESTIONS.md',
    path: 'reference/api/.env.example',
    reason: 'gap G-008 is that this file does not exist',
  },
  {
    file: 'docs/adopters/stynx/porting-pack/18-GAPS-AND-OPEN-QUESTIONS.md',
    path: 'apps/reference-frontend',
    reason: 'finding closure row records the deletion',
  },
  {
    file: 'docs/framework/arch/STYNX-CDK-SKELETON.md',
    path: 'infra/dashboards',
    reason: 'path inside the consumer repository skeleton, not this repository',
  },
  {
    file: 'docs/framework/contracts/cli-generator-1.5.md',
    path: 'database/ops_example.sql',
    reason: 'path inside the generated module output directory',
  },
  {
    file: 'packages-web/MIGRATING.md',
    path: 'packages-web/*/test/e2e/*.e2e-spec.ts',
    reason: 'migration note about the removal of these specs',
  },
  {
    file: 'packages/testing/README.md',
    path: 'test/integration',
    reason: 'conventional directory in the consuming application',
  },
];

const BUILD_OUTPUT_HINT = /(^|\/)(node_modules|dist|build|coverage|\.turbo|\.angular)(\/|$)/u;

function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      out += '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (ch === '*') out += '[^/]*';
    else out += ch.replace(/[.+?^${}()|[\]\\]/gu, '\\$&');
  }
  return new RegExp(`^${out}$`, 'u');
}

const historicalMatchers = HISTORICAL_RECORDS.map(({ glob }) => globToRegExp(glob));

export function isHistoricalRecord(file) {
  return historicalMatchers.some((re) => re.test(file));
}

const siteRouteMatchers = SITE_ROUTE_PAGES.map(({ glob }) => globToRegExp(glob));

export function isSiteRoutePage(file) {
  return siteRouteMatchers.some((re) => re.test(file));
}

// Blank out fenced code blocks, keeping line numbers stable.
export function stripFences(text) {
  const lines = text.split('\n');
  let fence = null;
  return lines.map((line) => {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      return '';
    }
    if (m) {
      fence = m[1];
      return '';
    }
    return line;
  });
}

function cleanTarget(raw) {
  let value = raw.trim();
  value = value.replace(/[?#].*$/u, '');
  value = value.replace(/[.,;:]+$/u, '');
  value = value.replace(/:\d+(?:[-–:]\d+|\+)?$/u, '');
  if (value.startsWith('./')) value = value.slice(2);
  return value;
}

const rootPattern = new RegExp(
  `^(?:\\./)?(?:${PATH_ROOTS.map((r) => r.replace('.', '\\.')).join('|')})/[^\\s]*$`,
  'u',
);

export function extractCitations(text) {
  const citations = [];
  const lines = stripFences(text);
  lines.forEach((line, index) => {
    if (!line) return;
    const withoutCode = line.replace(/`[^`]*`/gu, (span, offset) => {
      const body = span.slice(1, -1);
      const isLinkLabel =
        line[offset - 1] === '[' &&
        line.slice(offset + span.length, offset + span.length + 2) === '](';
      const placeholder = /[<>$=()|…"']|\.\.\.|\{[^,{}]*\}/u.test(body);
      if (!isLinkLabel && rootPattern.test(body) && !placeholder) {
        const path = cleanTarget(body);
        if (path) citations.push({ kind: 'code', line: index + 1, raw: body, path });
      }
      return ' '.repeat(span.length);
    });
    const linkPattern = /\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*)?\)/gu;
    const definition = withoutCode.match(/^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/u);
    const targets = [...withoutCode.matchAll(linkPattern)].map((m) => m[1]);
    if (definition) targets.push(definition[1]);
    for (const target of targets) {
      if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith('#') || target.startsWith('/'))
        continue;
      if (/[<>${}]/u.test(target)) continue;
      let path;
      try {
        path = cleanTarget(decodeURIComponent(target));
      } catch {
        path = cleanTarget(target);
      }
      if (path) citations.push({ kind: 'link', line: index + 1, raw: target, path });
    }
  });
  return citations;
}

function expandBraces(pattern) {
  const m = pattern.match(/\{([^{}]*)\}/u);
  if (!m) return [pattern];
  return m[1]
    .split(',')
    .flatMap((option) =>
      expandBraces(
        pattern.slice(0, m.index) + option.trim() + pattern.slice(m.index + m[0].length),
      ),
    );
}

function existsUnder(base, path) {
  for (const candidate of expandBraces(path)) {
    const trimmed = candidate.replace(/\/+$/u, '');
    if (!trimmed) continue;
    if (/[*?[\]]/u.test(trimmed)) {
      // Check the static prefix for `**`; expand single-level globs exactly.
      const doubleStar = trimmed.indexOf('**');
      if (doubleStar >= 0) {
        const prefix = trimmed.slice(0, doubleStar).replace(/\/+$/u, '');
        if (
          !/[*?[\]]/u.test(prefix)
            ? existsSync(join(base, prefix))
            : globSync(prefix, { cwd: base }).length > 0
        ) {
          return true;
        }
      } else if (globSync(trimmed, { cwd: base }).length > 0) return true;
    } else if (existsSync(join(base, trimmed))) return true;
  }
  return false;
}

function packageRootOf(root, file) {
  let dir = posix.dirname(file);
  while (dir && dir !== '.') {
    if (existsSync(join(root, dir, 'package.json'))) return dir;
    dir = posix.dirname(dir);
  }
  return null;
}

export function resolveCitation(root, file, citation) {
  const fileDir = posix.dirname(file);
  const bases = [];
  if (citation.kind === 'code') {
    bases.push('.');
    if (fileDir !== '.') bases.push(fileDir);
    const pkg = packageRootOf(root, file);
    if (pkg) bases.push(pkg);
    // Workspace submodule shorthand: `<package dir>/<name>`.
    const [first, ...rest] = citation.path.split('/');
    if (rest.length > 0 && rest[0]) {
      for (const tree of ['packages', 'packages-web']) {
        if (existsUnder(root, posix.join(tree, first, 'src', rest.join('/')))) return true;
      }
    }
  } else {
    bases.push(fileDir);
  }
  const variants = [citation.path];
  if (!/\.[a-z0-9]+$/iu.test(citation.path) && !citation.path.endsWith('/')) {
    const extensions =
      citation.kind === 'link' ? ['.md', '.mdx'] : ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs'];
    variants.push(...extensions.map((extension) => `${citation.path}${extension}`));
  }
  for (const base of bases) {
    for (const variant of variants) {
      const joined = posix.normalize(posix.join(base, variant));
      if (joined.startsWith('..')) continue;
      if (existsUnder(root, joined)) return true;
    }
  }
  return false;
}

function gitIgnored(root, paths) {
  if (paths.length === 0) return new Set();
  const result = spawnSync('git', ['check-ignore', '--stdin', '-z', '--no-index'], {
    cwd: root,
    input: paths.join('\0'),
    encoding: 'utf8',
  });
  if (result.status !== 0 && result.status !== 1) return new Set();
  return new Set(result.stdout.split('\0').filter(Boolean));
}

export function checkRepository(root, files, { historicalCitations = HISTORICAL_CITATIONS } = {}) {
  const waived = new Set(
    historicalCitations.map(({ file, path }) => `${file}\0${path.replace(/\/+$/u, '')}`),
  );
  const usedWaivers = new Set();
  const findings = [];
  let scanned = 0;
  let citations = 0;
  for (const file of files) {
    if (isHistoricalRecord(file)) continue;
    scanned += 1;
    const text = readFileSync(join(root, file), 'utf8');
    const routePage = isSiteRoutePage(file);
    for (const citation of extractCitations(text)) {
      if (routePage && citation.kind === 'link') continue;
      citations += 1;
      if (resolveCitation(root, file, citation)) continue;
      const waiverKey = `${file}\0${citation.path.replace(/\/+$/u, '')}`;
      if (waived.has(waiverKey)) {
        usedWaivers.add(waiverKey);
        continue;
      }
      findings.push({ file, ...citation });
    }
  }
  const candidates = findings.map((f) =>
    f.kind === 'code' ? f.path : posix.normalize(posix.join(posix.dirname(f.file), f.path)),
  );
  const ignored = gitIgnored(
    root,
    candidates.filter((p) => !p.startsWith('..') && !/[*?[\]{}]/u.test(p)),
  );
  const dead = findings.filter(
    (f, i) => !ignored.has(candidates[i]) && !BUILD_OUTPUT_HINT.test(candidates[i]),
  );
  // A waiver that no longer matches a dead citation is itself stale.
  const staleWaivers = historicalCitations.filter(
    ({ file, path }) =>
      files.includes(file) && !usedWaivers.has(`${file}\0${path.replace(/\/+$/u, '')}`),
  );
  return { scanned, citations, dead, staleWaivers };
}

function trackedMarkdown(root) {
  return execFileSync('git', ['ls-files', '-z', '--', '*.md', '*.mdx'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file && existsSync(join(root, file)));
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'check-doc-paths-'));
  const failures = [];
  const expect = (name, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  try {
    const write = (path, body) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), body);
    };
    write('packages/data/package.json', '{}');
    write('packages/data/src/index.ts', '');
    write('packages/data/docs/usage.md', '');
    write('packages/backend/src/audit/index.ts', '');
    write('docs/site/src/pages/index.mdx', '[route](docs/packages) and dead `packages/gone/x.ts`.');
    write('reference/api/main.ts', '');
    write('reference/web/main.ts', '');
    write('docs/guide/intro.md', '');
    write(
      'docs/guide/page.md',
      [
        'Live `packages/data/src/index.ts:12` and `reference/{api,web}/` and `packages/*/src/`.',
        'Dead `packages/stynx-core/README.md`, dead `backend/src/core`, dead `reference/{api,gone}/x.ts`.',
        'Template `packages/<name>/README.md`, placeholder `packages/data/{env}.ts`, command `scripts/run.sh --flag`, output `packages/data/dist/index.js`.',
        'Subpath `data/usage` is not a path. Link [ok](./intro.md#top), [ok](intro), [dead](../missing.md),',
        '[site](/docs/intro), [web](https://example.test/docs/x.md).',
        '[ref]: ./also-missing.md',
        'Submodule `backend/audit` lives, `backend/src/audit` does not, label [`backend/nope`](/docs/x) is skipped.',
        'Module `packages/data/src/index` resolves, consumed `.changeset/gone.md` is not checked.',
        'Ranges `packages/data/src/index.ts:25–31` and `packages/data/src/index.ts:75+` resolve.',
        '```',
        'Fenced `docs/never/checked.md` [x](nope.md)',
        '```',
      ].join('\n'),
    );
    write(
      'packages/data/README.md',
      'Local `docs/usage.md` resolves from the package root; `docs/nope.md` does not.',
    );
    write('law/adr/ADR-0001.md', 'Historical `backend/src/core` stays.');
    write('packages/data/CHANGELOG.md', 'Old `apps/reference-backend/x`.');
    const files = [
      'docs/site/src/pages/index.mdx',
      'docs/guide/page.md',
      'packages/data/README.md',
      'law/adr/ADR-0001.md',
      'packages/data/CHANGELOG.md',
    ];
    const result = checkRepository(root, files, { historicalCitations: [] });
    expect('scanned', result.scanned, 3);
    expect(
      'dead',
      result.dead.map((f) => `${f.file}:${f.line}:${f.kind}:${f.path}`),
      [
        'docs/site/src/pages/index.mdx:1:code:packages/gone/x.ts',
        'docs/guide/page.md:2:code:packages/stynx-core/README.md',
        'docs/guide/page.md:2:code:backend/src/core',
        'docs/guide/page.md:2:code:reference/{api,gone}/x.ts',
        'docs/guide/page.md:4:link:../missing.md',
        'docs/guide/page.md:6:link:also-missing.md',
        'docs/guide/page.md:7:code:backend/src/audit',
        'packages/data/README.md:1:code:docs/nope.md',
      ],
    );
    const waived = checkRepository(root, ['packages/data/README.md'], {
      historicalCitations: [
        { file: 'packages/data/README.md', path: 'docs/nope.md', reason: 'fixture' },
      ],
    });
    expect('waived', [waived.dead.length, waived.staleWaivers.length], [0, 0]);
    const staleWaiver = checkRepository(root, ['packages/data/README.md'], {
      historicalCitations: [
        { file: 'packages/data/README.md', path: 'docs/usage.md', reason: 'fixture' },
      ],
    });
    expect('stale waiver', staleWaiver.staleWaivers.length, 1);
    expect(
      'historical',
      [isHistoricalRecord('law/adr/x/y.md'), isHistoricalRecord('docs/law/adr.md')],
      [true, false],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`self-test failed — ${failure}`);
    process.exit(1);
  }
  console.log('check-doc-paths self-test passed');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const root = resolve(process.cwd());
  const files = trackedMarkdown(root);
  const { scanned, citations, dead, staleWaivers } = checkRepository(root, files);
  const missingWaiverFiles = HISTORICAL_CITATIONS.filter(({ file }) => !files.includes(file));
  const unusedRecords = HISTORICAL_RECORDS.filter(
    ({ glob }) => !files.some((file) => globToRegExp(glob).test(file)),
  );
  const stale = [
    ...staleWaivers.map(
      ({ file, path }) => `HISTORICAL_CITATIONS entry no longer needed: ${file} -> ${path}`,
    ),
    ...missingWaiverFiles.map(
      ({ file }) => `HISTORICAL_CITATIONS entry names a missing file: ${file}`,
    ),
    ...unusedRecords.map(({ glob }) => `HISTORICAL_RECORDS entry matches no tracked file: ${glob}`),
  ];
  if (args.includes('--json')) {
    console.log(JSON.stringify({ scanned, citations, dead, stale }, null, 2));
  } else {
    for (const f of dead) console.log(`${f.file}:${f.line}: dead ${f.kind} path ${f.path}`);
    for (const line of stale) console.log(line);
    const filesWithDead = new Set(dead.map((f) => f.file)).size;
    console.log(
      `check-doc-paths — ${scanned} files, ${citations} citations, ${dead.length} dead in ${filesWithDead} files`,
    );
  }
  process.exit(dead.length > 0 || stale.length > 0 ? 1 : 0);
}

if (
  import.meta.url === new URL(`file://${process.argv[1]}`).href ||
  process.argv[1]?.endsWith('check-doc-paths.mjs')
) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exit(2);
  }
}
