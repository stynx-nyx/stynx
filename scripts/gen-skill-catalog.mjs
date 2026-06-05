#!/usr/bin/env node
// R14-W10 generator: skill catalog.
//
// Shells out to `devai skill list` (JSON output from the built CLI) and
// produces a catalog at docs/site/docs/reference/skills/index.md plus a
// per-skill page at docs/site/docs/reference/skills/<id>.md.
//
// Per ADR-DOCS-IA Decision 6. Deterministic given the same skill catalog.
//
// Usage: node scripts/gen-skill-catalog.mjs [--repo-root <path>] [--out-dir <path>]

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function parseArgs(argv) {
  const out = { repoRoot: process.cwd(), outDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo-root') out.repoRoot = resolve(argv[++i]);
    else if (argv[i] === '--out-dir') out.outDir = resolve(argv[++i]);
  }
  return out;
}

export function loadSkills({ repoRoot }) {
  const bin = join(repoRoot, 'packages/cli/dist/bin.js');
  let stdout;
  try {
    stdout = execFileSync('node', [bin, 'skill', 'list'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 30_000,
    });
  } catch (err) {
    return { ok: false, error: err.message, skills: [] };
  }
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch (err) { return { ok: false, error: `parse: ${err.message}`, skills: [] }; }
  return { ok: true, skills: parsed.skills ?? [] };
}

function fmtField(label, value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.length === 0 ? null : `**${label}:** ${value.map(v => `\`${v}\``).join(', ')}`;
  return `**${label}:** \`${value}\``;
}

function renderSkillPage(skill, position) {
  const lines = [];
  const id = skill.id ?? skill.name ?? 'unknown';
  lines.push('---');
  lines.push(`title: ${id}`);
  lines.push(`sidebar_position: ${position}`);
  lines.push('---');
  lines.push('');
  lines.push(`# \`${id}\``);
  lines.push('');
  if (skill.description) {
    lines.push(skill.description);
    lines.push('');
  }
  const meta = [
    fmtField('Family', skill.family),
    fmtField('Authority role', skill.authority_role),
    fmtField('Agent class', skill.agent_class),
    fmtField('Permission tier', skill.permission_tier),
    fmtField('Gate ID', skill.gate_id),
    fmtField('Cycle level', skill.cycle_level),
    fmtField('Cycle role', skill.cycle_role),
    fmtField('Risk level', skill.risk_level),
    fmtField('Auto-fix capable', skill.auto_fix_capable),
  ].filter(Boolean);
  if (meta.length > 0) {
    lines.push(...meta.map(m => '- ' + m));
    lines.push('');
  }
  if (skill.allowed_write_scopes?.length) {
    lines.push('## Allowed write scopes');
    lines.push('');
    for (const scope of skill.allowed_write_scopes) lines.push(`- \`${scope}\``);
    lines.push('');
  }
  if (skill.evidence_files?.length) {
    lines.push('## Evidence files');
    lines.push('');
    for (const ef of skill.evidence_files) lines.push(`- \`${ef}\``);
    lines.push('');
  }
  lines.push('## See also');
  lines.push('');
  lines.push('- [Skill catalog](index.md) — full skill listing by family.');
  lines.push('- [Roles → agent disciplines](../../roles/agent-disciplines.md) — which discipline invokes which skill.');
  lines.push('');
  return lines.join('\n');
}

function renderIndex(skills) {
  // Group by family.
  const byFamily = new Map();
  for (const s of skills) {
    const fam = s.family ?? 'other';
    const arr = byFamily.get(fam) ?? [];
    arr.push(s);
    byFamily.set(fam, arr);
  }
  const families = [...byFamily.keys()].sort();

  const lines = [];
  lines.push('---');
  lines.push('title: Skills');
  lines.push('sidebar_position: 1');
  lines.push('---');
  lines.push('');
  lines.push('# Skills');
  lines.push('');
  lines.push(`> Auto-generated from \`devai skill list\` by \`scripts/gen-skill-catalog.mjs\` per [ADR-DOCS-IA Decision 6](../../meta/adr/ADR-DOCS-IA.md). **${skills.length}** skills registered across **${families.length}** families.`);
  lines.push('');
  for (const fam of families) {
    const arr = byFamily.get(fam).slice().sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
    lines.push(`## \`${fam}\` (${arr.length})`);
    lines.push('');
    lines.push('| Skill | Description |');
    lines.push('|---|---|');
    for (const s of arr) {
      const id = s.id ?? s.name ?? 'unknown';
      const slug = id.replace(/[^A-Za-z0-9_-]/g, '_');
      const desc = (s.description ?? '').replace(/\|/g, '\\|').split('\n')[0].slice(0, 120);
      lines.push(`| [\`${id}\`](${slug}.md) | ${desc} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function buildSkillCatalog({ repoRoot }) {
  const { ok, skills, error } = loadSkills({ repoRoot });
  if (!ok) {
    return { index: `# Skills\n\n> **Catalog unavailable.** \`devai skill list\` failed: ${error}.\n`, pages: [] };
  }
  const index = renderIndex(skills);
  const pages = skills.map((s, i) => ({
    id: (s.id ?? s.name ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '_'),
    content: renderSkillPage(s, i + 1),
  }));
  return { index, pages };
}

function main() {
  const { repoRoot, outDir } = parseArgs(process.argv.slice(2));
  const target = outDir ?? join(repoRoot, 'docs/site/docs/reference/skills');
  mkdirSync(target, { recursive: true });
  const { index, pages } = buildSkillCatalog({ repoRoot });
  writeFileSync(join(target, 'index.md'), index, 'utf8');
  for (const p of pages) writeFileSync(join(target, `${p.id}.md`), p.content, 'utf8');
  console.log(JSON.stringify({ ok: true, out_dir: target, pages: pages.length + 1 }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
