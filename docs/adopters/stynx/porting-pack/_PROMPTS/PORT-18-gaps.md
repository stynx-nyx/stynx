# PORT-18 — Gaps and Open Questions

**Produces:** `docs/stynx/porting-pack/18-GAPS-AND-OPEN-QUESTIONS.md`.
**Depends on:** all prior pack files (collects `[GAP]` markers).
**Branch:** `docs/stynx/porting-pack/18-gaps`.

## Mission

Honesty document. Per R5, every gap surfaced during pack generation
must land here. This document is the consuming agent's protection
against being misled.

## Process

1. `grep -rn "\[GAP" docs/stynx/porting-pack/` — collect every gap marker.
2. `grep -rn "NOT YET IMPLEMENTED" docs/stynx/porting-pack/` — collect every
   unimplemented surface.
3. Cross-check `docs/work/audit/07-FINDINGS-REGISTER.md` BLOCKER
   and MAJOR rows — every one should appear here as a porting risk.
4. Sweep the codebase for `TODO|FIXME|XXX|HACK` comments under
   `packages/` and `packages-web/` — sample 20 and add the
   relevant ones.

## Structure

```
# 18 — Gaps and Open Questions

## Things in the spec but not in code

- ...

## Things in code but not in the spec

- ...

## Patterns the pack does not cleanly answer

- ...

## TODOs / FIXMEs in the codebase that affect porting

- ...

## Open questions for the consuming team

- ...

## Severity classification

For each entry, assign BLOCKER / MAJOR / MINOR / NIT and link to
the audit FIND-NNN if applicable. BLOCKERs from the audit
(FIND-001/002/004/010 at baseline) MUST appear here.

## How to interpret this document

- BLOCKER: do not begin the affected phase of the port until this
  is resolved upstream.
- MAJOR: port may proceed but the affected surface needs a
  workaround or a follow-up.
- MINOR: cosmetic; document and move on.
- NIT: noted, no action.
```

## Rules

- No gap may be silently dropped. If you considered a gap and
  decided it didn't belong, leave a one-line note saying so.
- Cross-reference the audit findings register; no MAJOR/BLOCKER
  audit finding should be missing here.

## Acceptance

- Document non-empty.
- Every BLOCKER from the audit appears here.
- Every `[GAP]` marker in the rest of the pack is reflected here.
