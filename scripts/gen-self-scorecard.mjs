#!/usr/bin/env node
// R14-W10 generator: self-scorecard.
//
// Reads the latest scorecard JSON snapshot (from
// .devai/state/skills/SKILL-compute-scorecard/<latest>.json or the
// baseline at docs/work/round-9007/audit/scorecard.baseline.json) and
// emits the 5×9 grid with verdicts as markdown into
// docs/site/docs/meta/self-scorecard.md.
//
// Per ADR-DOCS-IA Decision 7: frozen-at-build; the page's last_built_at
// frontmatter reflects the input file's mtime.
//
// Usage: node scripts/gen-self-scorecard.mjs [--repo-root <path>] [--out <path>]

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

function parseArgs(argv) {
  const out = { repoRoot: process.cwd(), outPath: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo-root') out.repoRoot = resolve(argv[++i]);
    else if (argv[i] === '--out') out.outPath = resolve(argv[++i]);
  }
  return out;
}

const SUBSTRATES = ['F1', 'F2', 'F3', 'F4', 'F5'];
const TRANSVERSALS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'];

const VERDICT_BADGES = {
  PASS: '✅ PASS',
  REVIEW: '🟡 REVIEW',
  FAIL: '❌ FAIL',
  'N/A': '— N/A',
  UNKNOWN: '❔ UNKNOWN',
  pass: '✅ PASS',
  review: '🟡 REVIEW',
  fail: '❌ FAIL',
  unknown: '❔ UNKNOWN',
  na: '— N/A',
};

export function findLatestScorecard(repoRoot) {
  // Primary source: .devai/state/skills/SKILL-compute-scorecard/<timestamp>.json
  const skillDir = join(repoRoot, '.devai/state/skills/SKILL-compute-scorecard');
  if (existsSync(skillDir)) {
    let names;
    try { names = readdirSync(skillDir); } catch { names = []; }
    const jsons = names.filter(n => n.endsWith('.json'));
    if (jsons.length > 0) {
      // Lexicographic order over ISO timestamps == chronological order.
      jsons.sort();
      return { path: join(skillDir, jsons[jsons.length - 1]), source: 'skill-output' };
    }
  }
  // Fallback: the baseline preserved in round-9007's audit.
  const baseline = join(repoRoot, 'docs/work/round-9007/audit/scorecard.baseline.json');
  if (existsSync(baseline)) {
    return { path: baseline, source: 'baseline' };
  }
  return null;
}

function loadScorecard(path) {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  // Skill outputs wrap the scorecard in `evidence`; baselines are flat.
  const data = parsed.evidence ?? parsed;
  // Build cell index { 'F1×T1' → { verdict, sensor_readings, deterministic } }
  const index = new Map();
  for (const cell of data.cells ?? []) {
    const key = `${cell.substrate}×${cell.property}`;
    index.set(key, cell);
  }
  return { data, index };
}

export function buildSelfScorecard({ repoRoot }) {
  const located = findLatestScorecard(repoRoot);
  const lines = [];
  lines.push('---');
  lines.push('title: Self-scorecard');
  lines.push('sidebar_position: 1');
  if (located) {
    const mtime = statSync(located.path).mtime.toISOString();
    lines.push(`last_built_at: ${mtime}`);
  }
  lines.push('---');
  lines.push('');
  lines.push('# Self-scorecard');
  lines.push('');
  if (!located) {
    lines.push('> **No scorecard data found.** Run `devai score compute` to produce a scorecard snapshot at `.devai/state/skills/SKILL-compute-scorecard/`, then re-run this generator.');
    lines.push('');
    return lines.join('\n');
  }
  const { data, index } = loadScorecard(located.path);
  lines.push('> DEVAI applies to itself per [Constitution Article 36](../framework/constitution.md). This page is the substrate × transversal grid with current verdicts — the framework\'s own accountability surface.');
  lines.push('');
  lines.push(`**Source:** \`${located.source}\` (\`${located.path.replace(repoRoot + '/', '')}\`)`);
  if (data.id) lines.push(`**Snapshot ID:** \`${data.id}\``);
  if (data.generated_at) lines.push(`**Generated at:** ${data.generated_at}`);
  if (data.integration_head) lines.push(`**Integration HEAD:** \`${data.integration_head}\``);
  lines.push('');
  // Tally.
  const tally = { PASS: 0, REVIEW: 0, FAIL: 0, 'N/A': 0, UNKNOWN: 0 };
  for (const cell of data.cells ?? []) {
    const v = cell.verdict?.toUpperCase() ?? 'UNKNOWN';
    if (tally[v] === undefined) tally.UNKNOWN++;
    else tally[v]++;
  }
  lines.push(`**Totals:** ${tally.PASS} PASS · ${tally.REVIEW} REVIEW · ${tally.FAIL} FAIL · ${tally['N/A']} N/A · ${tally.UNKNOWN} UNKNOWN.`);
  lines.push('');
  // Grid.
  lines.push('| Substrate \\ Transversal | ' + TRANSVERSALS.join(' | ') + ' |');
  lines.push('|' + '---|'.repeat(TRANSVERSALS.length + 1));
  for (const sub of SUBSTRATES) {
    const row = [`**${sub}**`];
    for (const trans of TRANSVERSALS) {
      const cell = index.get(`${sub}×${trans}`);
      if (!cell) row.push('—');
      else row.push(VERDICT_BADGES[cell.verdict] ?? cell.verdict);
    }
    lines.push('| ' + row.join(' | ') + ' |');
  }
  lines.push('');
  lines.push('## See also');
  lines.push('');
  lines.push('- [Aspect grid](../framework/aspect-grid.md) — which sensor scores each cell (without verdicts).');
  lines.push('- [Scorecard](../framework/scorecard.md) — verdict semantics + thresholds.');
  lines.push('- [Test matrix](test-matrix.md) — DEVAI\'s own current suite measurements.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const { repoRoot, outPath } = parseArgs(process.argv.slice(2));
  const content = buildSelfScorecard({ repoRoot });
  const target = outPath ?? join(repoRoot, 'docs/site/docs/meta/self-scorecard.md');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  console.log(JSON.stringify({ ok: true, out: target, bytes: content.length }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
