# PORT-17 — Agent Context Package

**Produces:** `docs/stynx/porting-pack/17-AGENT-CONTEXT-PACKAGE.md`.
**Depends on:** all prior pack files.
**Branch:** `docs/stynx/porting-pack/17-agent-context`.

## Mission

A 2,000–3,000-word compact context blob optimized for pasting
directly into a downstream LLM agent's system prompt or initial
context. The operator copies this single document into a fresh
chat and the receiving agent has enough grounding to start.

## Structure

```
# 17 — Agent Context Package

## Mission statement (paste into your system prompt)

You are porting <FOREIGN APP> onto STYNX. STYNX is a multi-tenant
TypeScript/NestJS platform with pool-and-RLS tenancy, RBAC
permissions, archive-schema soft delete, Cognito-based identity,
and a strict invariant set. Your job is to follow the porting
playbook in `11-PORTING-PLAYBOOK.md` and produce code that passes
the verification checklist in `14-VERIFICATION-CHECKLIST.md`.

## The 10 most critical facts about STYNX

1. Pool + RLS only. ...
2. No `deleted_at` on live tables. ...
3. Every route has @Permission/@Public/@System. ...
4. ...
(Distill from `04-INVARIANTS-AND-CONTRACTS.md`.)

## The phases of the port (one paragraph each)

[Phase 0 — assessment …]
[Phase 1 — foundation …]
… (from `11-PORTING-PLAYBOOK.md`)

## Common pitfalls (one line each)

- (from `13-COMMON-PITFALLS.md`)

## Where to look in the pack for more detail

- Invariants → `04`.
- Package surface → `05`.
- Data patterns → `06`.
- Auth/tenancy → `07`.
- Migrations → `08`.
- Frontend → `09`.
- Infra → `10`.
- Playbook → `11`.
- Decision trees → `12`.
- Pitfalls → `13`.
- Verification → `14`.
- Spec excerpts → `16-SPEC-EXCERPTS/`.

## Canonical opening prompt (paste this verbatim)

> You have access to the STYNX Porting Pack at docs/stynx/porting-pack/.
> You are porting <FOREIGN APP> at <PATH> onto STYNX.
>
> Step 1: read `00-README.md`, then `02-IS-STYNX-RIGHT-FOR-YOU.md`,
> then `11-PORTING-PLAYBOOK.md` Phase 0.
>
> Step 2: scan <FOREIGN APP> using the matrix in Phase 0 and
> produce `./adoption/ASSESSMENT.md` using the template at the
> end of `11`.
>
> Step 3: stop and report. Do not begin Phase 1 until the
> operator approves the assessment.

## Output format hints

- The agent must produce `./adoption/ASSESSMENT.md` before any code.
- All migrations go in `./migrations/` and follow the naming convention
  `NNNN_description.sql`.
- All `@stynx-nyx/*` imports use barrel paths only (no deep imports).
- Every controller method must carry @Permission, @Public, or @System.
- Every mutation method must carry @Audit (or @NoAudit('reason')).
```

## Rules

- 2,000–3,000 words total. Edit ruthlessly.
- The "10 critical facts" must each be ≤2 sentences.
- The opening prompt must be standalone — pastable into a new chat
  with no other context.

## Acceptance

- Word count in [2000, 3000].
- All sections present.
- Cross-references resolve to real pack files.
