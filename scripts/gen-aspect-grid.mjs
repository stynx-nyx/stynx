#!/usr/bin/env node
// R14-W10 generator: aspect grid.
//
// Reads per-sensor design notes under docs/framework/arch/sensors/ and
// extracts the (substrate, transversal) cell each sensor scores via the
// H1 pattern `Sensor: \`<name>\` → F<n>×T<n>`. Emits the 5×9 grid as
// markdown into docs/site/docs/framework/aspect-grid.md (adopter-facing
// projection — sensor kinds per cell, no verdicts; verdicts are repo-
// local and live on the self-scorecard).
//
// Per ADR-DOCS-IA Decision 6 + Decision 7: deterministic pure function
// of in-repo inputs; ships with a vitest contract test.
//
// Usage: node scripts/gen-aspect-grid.mjs [--repo-root <path>] [--out <path>]

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

function parseArgs(argv) {
  const out = { repoRoot: process.cwd(), outPath: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo-root') out.repoRoot = resolve(argv[++i]);
    else if (argv[i] === '--out') out.outPath = resolve(argv[++i]);
  }
  return out;
}

// Substrate × transversal layout.
const SUBSTRATES = [
  { id: 'F1', label: 'F1 Specification' },
  { id: 'F2', label: 'F2 Plant' },
  { id: 'F3', label: 'F3 Observation' },
  { id: 'F4', label: 'F4 Inventory' },
  { id: 'F5', label: 'F5 Harness' },
];
const TRANSVERSALS = [
  { id: 'T1', label: 'T1 Coverage' },
  { id: 'T2', label: 'T2 Depth' },
  { id: 'T3', label: 'T3 Coherence' },
  { id: 'T4', label: 'T4 Alignment' },
  { id: 'T5', label: 'T5 Idiomaticity' },
  { id: 'T6', label: 'T6 Security' },
  { id: 'T7', label: 'T7 Performance' },
  { id: 'T8', label: 'T8 Robustness' },
  { id: 'T9', label: 'T9 Discipline' },
];

// Degenerate cells per Article 5 (N/A by design).
const NA_CELLS = new Map([
  ['F4×T5', 'Inventory is generated, not authored — no idiomatic style.'],
  ['F5×T2', 'Harness artifacts are config + machinery, not depth-bearing prose.'],
]);

/**
 * Parse the (substrate, transversal) pair from a sensor design note's H1.
 * Matches patterns like:
 *   # Sensor: `harness_coherence` → F5×T3
 *   # Sensor: `spec-alignment` → F1 × T4
 * Returns { sensor, substrate, transversal } or null.
 */
function parseSensorNote(content) {
  const m = content.match(/^#\s+Sensor:\s+`([^`]+)`\s*→\s*(F[1-5])\s*[×x]\s*(T[1-9])/m);
  if (!m) return null;
  return { sensor: m[1], substrate: m[2], transversal: m[3] };
}

function loadSensorMappings(repoRoot) {
  const dir = join(repoRoot, 'docs/framework/arch/sensors');
  let entries;
  try { entries = readdirSync(dir); } catch { return new Map(); }
  const cellMap = new Map();
  for (const entry of entries) {
    if (!entry.endsWith('.md') || entry === 'README.md') continue;
    const path = join(dir, entry);
    try {
      const content = readFileSync(path, 'utf8');
      const parsed = parseSensorNote(content);
      if (!parsed) continue;
      const cellKey = `${parsed.substrate}×${parsed.transversal}`;
      const existing = cellMap.get(cellKey) ?? [];
      existing.push({ sensor: parsed.sensor, note: entry });
      cellMap.set(cellKey, existing);
    } catch { /* skip unreadable */ }
  }
  return cellMap;
}

function renderCell(cellKey, sensors) {
  if (NA_CELLS.has(cellKey)) return `N/A — ${NA_CELLS.get(cellKey)}`;
  if (sensors.length === 0) return 'UNKNOWN';
  return sensors.map(s => `[\`${s.sensor}\`](arch/sensors/${s.note.replace(/\.md$/, '')})`).join('<br/>');
}

export function buildAspectGrid({ repoRoot }) {
  const cellMap = loadSensorMappings(repoRoot);
  const lines = [];
  lines.push('---');
  lines.push('title: Aspect grid');
  lines.push('sidebar_position: 4');
  lines.push('---');
  lines.push('');
  lines.push('# Aspect grid');
  lines.push('');
  lines.push('> The 5×9 substrate × transversal grid. Each cell names the sensor kind that scores it (or marks the cell N/A per [Article 5](constitution.md), or UNKNOWN if no sensor is yet mapped). Adopter-facing projection: verdicts are repo-local and live on the [self-scorecard](../meta/self-scorecard.md).');
  lines.push('');
  lines.push('Generated at publish time by `scripts/gen-aspect-grid.mjs` from `docs/framework/arch/sensors/*.md` per [ADR-DOCS-IA Decision 6](../meta/adr/ADR-DOCS-IA.md).');
  lines.push('');
  // Header row.
  lines.push('| ' + ['Substrate \\ Transversal', ...TRANSVERSALS.map(t => t.id)].join(' | ') + ' |');
  lines.push('|' + '---|'.repeat(TRANSVERSALS.length + 1));
  // Body rows.
  for (const sub of SUBSTRATES) {
    const row = [`**${sub.id}**`];
    for (const trans of TRANSVERSALS) {
      const key = `${sub.id}×${trans.id}`;
      const sensors = cellMap.get(key) ?? [];
      row.push(renderCell(key, sensors));
    }
    lines.push('| ' + row.join(' | ') + ' |');
  }
  lines.push('');
  // Summary.
  let mapped = 0, na = 0, unknown = 0;
  for (const sub of SUBSTRATES) {
    for (const trans of TRANSVERSALS) {
      const key = `${sub.id}×${trans.id}`;
      if (NA_CELLS.has(key)) na++;
      else if ((cellMap.get(key) ?? []).length > 0) mapped++;
      else unknown++;
    }
  }
  lines.push(`**Summary:** ${mapped} cells mapped to a sensor · ${na} cells N/A by design · ${unknown} cells UNKNOWN.`);
  lines.push('');
  lines.push('## See also');
  lines.push('');
  lines.push('- [Transversals](transversals.md) — what each T1-T9 measures across substrates.');
  lines.push('- [Substrates](substrates.md) — F1-F5 contents and authority.');
  lines.push('- [Scorecard](scorecard.md) — verdict semantics for cells.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const { repoRoot, outPath } = parseArgs(process.argv.slice(2));
  const content = buildAspectGrid({ repoRoot });
  const target = outPath ?? join(repoRoot, 'docs/site/docs/framework/aspect-grid.md');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  console.log(JSON.stringify({ ok: true, out: target, bytes: content.length }));
}

// Only run main() if invoked directly.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
