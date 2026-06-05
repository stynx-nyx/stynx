# Porting Pack — Generation Plan

This file orchestrates the generation of the porting pack. The pack
is produced by running the prompts in [`_PROMPTS/`](_PROMPTS/) in the
order below. Each prompt is self-contained (it tells the executing
agent which files to read, what to write, and how to cite).

## Why a sequence and not one shot

The full pack is 25,000–40,000 words across 30+ files with inline
citations on every claim. Producing it in a single agent turn risks
violating R1 (no prior-knowledge content) and R5 (no invention).
Each prompt below scopes one artifact tightly enough that the
generator can do real discovery reads before writing.

## Execution model

Run each prompt as its own agent invocation. Recommended:

- **Foreground, sequential** — for the first few (PORT-DISCOVERY,
  PORT-04, PORT-05). Their output informs later prompts.
- **Parallelizable** — once 04, 05, 16-EXCERPTS exist, prompts
  06–13 and 15-\* can run in parallel; they cite the earlier
  artifacts and the spec rather than each other.

The dependency line in each prompt's front matter states what must
already exist.

## Sequence

| #   | Prompt                                                          | Produces                                    | Depends on                         | Effort |
| --- | --------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- | ------ |
| D   | [PORT-00-DISCOVERY.md](_PROMPTS/PORT-00-DISCOVERY.md)           | `_DISCOVERY.md` (notes only)                | —                                  | M      |
| 16  | [PORT-16-spec-excerpts.md](_PROMPTS/PORT-16-spec-excerpts.md)   | `16-SPEC-EXCERPTS/*.md`                     | D                                  | L      |
| 04  | [PORT-04-invariants.md](_PROMPTS/PORT-04-invariants.md)         | `04-INVARIANTS-AND-CONTRACTS.md`            | D, 16                              | M      |
| 05  | [PORT-05-catalog.md](_PROMPTS/PORT-05-catalog.md)               | `05-PACKAGE-CATALOG.md`                     | D                                  | M      |
| 03  | [PORT-03-concepts.md](_PROMPTS/PORT-03-concepts.md)             | `03-CORE-CONCEPTS.md`                       | D, 04                              | S      |
| 01  | [PORT-01-what-is-stynx.md](_PROMPTS/PORT-01-what-is-stynx.md)   | `01-WHAT-IS-STYNX.md`                       | D, 04, 05                          | S      |
| 02  | [PORT-02-fit.md](_PROMPTS/PORT-02-fit.md)                       | `02-IS-STYNX-RIGHT-FOR-YOU.md`              | 01                                 | S      |
| 06  | [PORT-06-data-patterns.md](_PROMPTS/PORT-06-data-patterns.md)   | `06-DATA-LAYER-PATTERNS.md`                 | 04, 05, 16                         | L      |
| 07  | [PORT-07-auth-tenancy.md](_PROMPTS/PORT-07-auth-tenancy.md)     | `07-AUTH-AND-TENANCY-PATTERNS.md`           | 04, 05, 16                         | L      |
| 08  | [PORT-08-migrations.md](_PROMPTS/PORT-08-migrations.md)         | `08-MIGRATION-PATTERNS.md`                  | 04, 06                             | L      |
| 09  | [PORT-09-frontend.md](_PROMPTS/PORT-09-frontend.md)             | `09-FRONTEND-PATTERNS.md`                   | 05                                 | M      |
| 10  | [PORT-10-infra.md](_PROMPTS/PORT-10-infra.md)                   | `10-INFRASTRUCTURE-REQUIREMENTS.md`         | D                                  | M      |
| 12  | [PORT-12-decision-trees.md](_PROMPTS/PORT-12-decision-trees.md) | `12-DECISION-TREES.md`                      | 04, 06, 08                         | M      |
| 13  | [PORT-13-pitfalls.md](_PROMPTS/PORT-13-pitfalls.md)             | `13-COMMON-PITFALLS.md`                     | 06, 08                             | M      |
| 11  | [PORT-11-playbook.md](_PROMPTS/PORT-11-playbook.md)             | `11-PORTING-PLAYBOOK.md`                    | 04–10, 12, 13                      | XL     |
| 14  | [PORT-14-checklist.md](_PROMPTS/PORT-14-checklist.md)           | `14-VERIFICATION-CHECKLIST.md`              | 04, 11                             | M      |
| 15  | [PORT-15-examples.md](_PROMPTS/PORT-15-examples.md)             | `15-REFERENCE-EXAMPLES/*.md`                | 06–09                              | XL     |
| 17  | [PORT-17-agent-context.md](_PROMPTS/PORT-17-agent-context.md)   | `17-AGENT-CONTEXT-PACKAGE.md`               | all prior                          | M      |
| 18  | [PORT-18-gaps.md](_PROMPTS/PORT-18-gaps.md)                     | `18-GAPS-AND-OPEN-QUESTIONS.md`             | all prior (collects gaps surfaced) | M      |
| 99  | [PORT-99-provenance.md](_PROMPTS/PORT-99-provenance.md)         | `99-PROVENANCE.md` + updated `00-README.md` | all prior                          | S      |

## Definition of done (sequence-level)

- Every artifact in `00-README.md`'s file index is present and non-empty.
- `git diff --stat` shows changes only under `docs/stynx/porting-pack/`.
- Spot check from R7 — drop the `docs/stynx/porting-pack/` directory into a fresh
  repo and confirm a consuming agent can complete a full port using
  only its contents.
- `18-GAPS-AND-OPEN-QUESTIONS.md` is non-empty (perfect alignment with
  spec is unlikely; surface anything the audit found —
  `docs/work/audit/07-FINDINGS-REGISTER.md` is a good cross-check).

## Ground rules every prompt inherits

R1–R8 from the original generation brief apply to every prompt:

- **R1** Source of truth is the repo at HEAD, not prior knowledge.
- **R2** Every non-trivial claim cites a file path (and line range
  when useful).
- **R3** Audience is an LLM agent on a foreign codebase with only the
  pack — no "ask the team" escape hatches.
- **R4** Mark unimplemented features as `[NOT YET IMPLEMENTED — spec only]`.
- **R5** Mark missing facts as `[GAP — investigate before porting]`
  and surface in `18-GAPS-AND-OPEN-QUESTIONS.md`.
- **R6** Markdown only, UTF-8, LF, ASCII-clean.
- **R7** Pack must be self-contained.
- **R8** No edits outside `docs/stynx/porting-pack/`.
