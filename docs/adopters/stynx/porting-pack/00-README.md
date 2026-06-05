# STYNX Porting Pack

A self-contained reference for coding agents (Codex, Claude Code,
Cursor, etc.) operating on **foreign repositories** that need to be
ported onto the STYNX platform. Consuming agents will not have
access to this STYNX repository — every fact they need lives in
this pack.

## What this pack is for

When an operator wants to port a foreign application onto STYNX,
they hand the pack contents to an LLM agent and that agent walks the
foreign codebase through the playbook in
[`11-PORTING-PLAYBOOK.md`](11-PORTING-PLAYBOOK.md). The pack
provides the spec excerpts, package catalog, decision trees,
patterns, pitfalls, and verification checklist needed to do the
port without reading the STYNX source.

## Reading order

| Goal                              | Sequence                                                                |
| --------------------------------- | ----------------------------------------------------------------------- |
| First-time port                   | `00 → 01 → 02 → 11`                                                     |
| Debug a port issue                | `13 → 14 → 17`                                                          |
| Generate a specific layer         | `06` (data) / `07` (auth+tenancy) / `08` (migrations) / `09` (frontend) |
| Drop into a fresh agent's context | paste `17-AGENT-CONTEXT-PACKAGE.md`                                     |
| Audit fidelity                    | `04 → 16-SPEC-EXCERPTS/ → 18`                                           |

## File index

| File                                | Status | One-line summary                          |
| ----------------------------------- | ------ | ----------------------------------------- |
| `00-README.md`                      | ✅     | This file                                 |
| `_GENERATION-PLAN.md`               | ✅     | Sequence of prompts that built the pack   |
| `_DISCOVERY.md`                     | ✅     | Grounding notes from PORT-00              |
| `_PROMPTS/`                         | ✅     | 21 self-contained prompts                 |
| `01-WHAT-IS-STYNX.md`               | ✅     | Elevator pitch + capability matrix        |
| `02-IS-STYNX-RIGHT-FOR-YOU.md`      | ✅     | Fit checklist + decision tree             |
| `03-CORE-CONCEPTS.md`               | ✅     | Glossary                                  |
| `04-INVARIANTS-AND-CONTRACTS.md`    | ✅     | I1–I8 + cross-cutting contracts           |
| `05-PACKAGE-CATALOG.md`             | ✅     | Per-package surface + decision matrix     |
| `06-DATA-LAYER-PATTERNS.md`         | ✅     | Database/Transaction patterns             |
| `07-AUTH-AND-TENANCY-PATTERNS.md`   | ✅     | Auth, tenancy, sessions, permissions      |
| `08-MIGRATION-PATTERNS.md`          | ✅     | Migration helpers + linter rules          |
| `09-FRONTEND-PATTERNS.md`           | ✅     | Angular + sdk patterns                    |
| `10-INFRASTRUCTURE-REQUIREMENTS.md` | ✅     | AWS resources, env vars, secrets          |
| `11-PORTING-PLAYBOOK.md`            | ✅     | Phase 0..7 playbook + assessment template |
| `12-DECISION-TREES.md`              | ✅     | Seven Mermaid decision trees              |
| `13-COMMON-PITFALLS.md`             | ✅     | Pre-emptive postmortem                    |
| `14-VERIFICATION-CHECKLIST.md`      | ✅     | Done criteria                             |
| `15-REFERENCE-EXAMPLES/`            | ✅     | Five before/after examples                |
| `16-SPEC-EXCERPTS/`                 | ✅     | Six self-contained spec excerpts          |
| `17-AGENT-CONTEXT-PACKAGE.md`       | ✅     | Compact context blob                      |
| `18-GAPS-AND-OPEN-QUESTIONS.md`     | ✅     | Honesty document                          |
| `99-PROVENANCE.md`                  | ✅     | Reproducibility metadata                  |

## What this pack is NOT

- Not a STYNX user manual.
- Not a guide for new green-field STYNX apps (use `stynx init`).
- Not a substitute for reading the actual spec — but it is a
  substitute for reading it from inside the STYNX repo (the
  excerpts in [`16-SPEC-EXCERPTS/invariants.md`](16-SPEC-EXCERPTS/invariants.md) are
  authoritative for porting).
- Not a one-shot mega-prompt; the pack is reference material for
  an agent that runs many prompts.

## Provenance

- **Generated at:** 2026-04-27 (UTC)
- **Source commit:** `670d165253efd66113e338cd0c79d4c8fcbc8be7`
- **Source branch:** `clean/doc-pass`
- **Generator:** Claude Code (`claude-opus-4-7`)

Full provenance in [`99-PROVENANCE.md`](99-PROVENANCE.md).
Known gaps in [`18-GAPS-AND-OPEN-QUESTIONS.md`](18-GAPS-AND-OPEN-QUESTIONS.md).
