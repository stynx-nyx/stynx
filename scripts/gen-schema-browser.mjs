#!/usr/bin/env node
// R14-W10 generator: schema browser.
//
// Reads docs/framework/schemas/*.schema.json and emits an indexed catalog
// at docs/site/docs/framework/schemas/index.md plus per-schema pages
// listing title, $id, description, top-level properties, and full JSON
// in a collapsible <details> block.
//
// Per ADR-DOCS-IA Decision 6.
//
// Usage: node scripts/gen-schema-browser.mjs [--repo-root <path>] [--out-dir <path>]

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function parseArgs(argv) {
  const out = { repoRoot: process.cwd(), outDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo-root') out.repoRoot = resolve(argv[++i]);
    else if (argv[i] === '--out-dir') out.outDir = resolve(argv[++i]);
  }
  return out;
}

export function loadSchemas({ repoRoot }) {
  const dir = join(repoRoot, 'docs/framework/schemas');
  let entries;
  try { entries = readdirSync(dir); } catch { return []; }
  const schemas = [];
  for (const entry of entries) {
    if (!entry.endsWith('.schema.json')) continue;
    const path = join(dir, entry);
    try {
      const raw = readFileSync(path, 'utf8');
      const data = JSON.parse(raw);
      schemas.push({ file: entry, name: entry.replace(/\.schema\.json$/, ''), data, raw });
    } catch { /* skip unreadable / invalid */ }
  }
  schemas.sort((a, b) => a.name.localeCompare(b.name));
  return schemas;
}

function describeProperties(properties) {
  if (!properties || typeof properties !== 'object') return [];
  return Object.entries(properties).map(([key, value]) => ({
    name: key,
    type: value?.type ?? (value?.$ref ? '$ref' : (value?.enum ? 'enum' : 'object')),
    description: value?.description?.split('\n')[0] ?? '',
  }));
}

function renderSchemaPage(schema, position) {
  const { data, name, raw } = schema;
  const lines = [];
  lines.push('---');
  lines.push(`title: ${data.title ?? name}`);
  lines.push(`sidebar_position: ${position}`);
  lines.push('---');
  lines.push('');
  lines.push(`# \`${name}.schema.json\``);
  lines.push('');
  if (data.title) lines.push(`**Title:** ${data.title}`);
  if (data.$id) lines.push(`**\`$id\`:** \`${data.$id}\``);
  if (data.schemaVersion) lines.push(`**Schema version:** \`${data.schemaVersion}\``);
  if (data.description) {
    lines.push('');
    lines.push(data.description);
  }
  lines.push('');
  const props = describeProperties(data.properties);
  if (props.length > 0) {
    lines.push('## Top-level properties');
    lines.push('');
    lines.push('| Property | Type | Description |');
    lines.push('|---|---|---|');
    for (const p of props) {
      const desc = p.description.replace(/\|/g, '\\|').slice(0, 200);
      lines.push(`| \`${p.name}\` | \`${p.type}\` | ${desc} |`);
    }
    lines.push('');
  }
  lines.push('## Source');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Click to expand the full JSON</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(raw.trimEnd());
  lines.push('```');
  lines.push('');
  lines.push('</details>');
  lines.push('');
  lines.push('## See also');
  lines.push('');
  lines.push('- [Schema browser](index.md) — full catalog of schemas.');
  lines.push('- [Invariants](../invariants.md) — how schemas back the invariant contract.');
  lines.push('');
  return lines.join('\n');
}

function renderIndex(schemas) {
  const lines = [];
  lines.push('---');
  lines.push('title: Schemas');
  lines.push('sidebar_position: 4');
  lines.push('---');
  lines.push('');
  lines.push('# Schemas');
  lines.push('');
  lines.push(`> Auto-generated from \`docs/framework/schemas/*.schema.json\` by \`scripts/gen-schema-browser.mjs\` per [ADR-DOCS-IA Decision 6](../../meta/adr/ADR-DOCS-IA.md). **${schemas.length}** schemas in the catalog.`);
  lines.push('');
  lines.push('| Name | Title | Description |');
  lines.push('|---|---|---|');
  for (const s of schemas) {
    const slug = s.name.replace(/[^A-Za-z0-9_-]/g, '_');
    const title = (s.data.title ?? s.name).replace(/\|/g, '\\|').slice(0, 80);
    const desc = (s.data.description ?? '').replace(/\|/g, '\\|').split('\n')[0].slice(0, 120);
    lines.push(`| [\`${s.name}\`](${slug}.md) | ${title} | ${desc} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function buildSchemaBrowser({ repoRoot }) {
  const schemas = loadSchemas({ repoRoot });
  const index = renderIndex(schemas);
  const pages = schemas.map((s, i) => ({
    name: s.name.replace(/[^A-Za-z0-9_-]/g, '_'),
    content: renderSchemaPage(s, i + 1),
  }));
  return { index, pages, count: schemas.length };
}

function main() {
  const { repoRoot, outDir } = parseArgs(process.argv.slice(2));
  const target = outDir ?? join(repoRoot, 'docs/site/docs/framework/schemas');
  mkdirSync(target, { recursive: true });
  const { index, pages, count } = buildSchemaBrowser({ repoRoot });
  writeFileSync(join(target, 'index.md'), index, 'utf8');
  for (const p of pages) writeFileSync(join(target, `${p.name}.md`), p.content, 'utf8');
  console.log(JSON.stringify({ ok: true, out_dir: target, schemas: count, pages: pages.length + 1 }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
