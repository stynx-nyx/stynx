# PORT-13 — Common Pitfalls

**Produces:** `docs/stynx/porting-pack/13-COMMON-PITFALLS.md`.
**Depends on:** `06`, `08`.
**Branch:** `docs/stynx/porting-pack/13-pitfalls`.

## Mission

Pre-emptive postmortem of mistakes other ports tend to hit.

## Read

- `specs/STYNX-ADOPT-EXAMPLE.md` (mine for failure modes).
- `internal work note (not published)` (drift caught in audit).
- `internal work note (not published)` if present.

## Format per pitfall

```
### <pitfall name>

- **Symptom:** <what the agent sees>
- **Root cause:** <why it happens>
- **Fix:** <what to do>
- **Detection:** <how to catch earlier — grep, lint, doctor>
- **Citation:** <file path or spec ref>
```

## Required pitfalls (cover at minimum)

1. `organization_id` is not always `tenant_id` — semantic mis-rename.
2. Ad-hoc `deleted` columns containing test data getting polluted into archive at cutover.
3. Missing `updated_at` / `updated_by` on legacy tables and the backfill problem.
4. JWT claim shape change breaking existing clients.
5. Default `block` FK annotation producing user-facing 409s unexpectedly.
6. Raw SQL with complex joins not surviving auto-conversion to Drizzle.
7. Cognito user-import is not a codemod — it is an operational runbook.
8. Migrating data from existing soft-delete to archive at cutover.
9. RLS policy drift between live and archive mirrors.
10. Treating `withSystemContext` as a free pass — it bypasses tenant scope, not audit.

Add others if grounded.

## Rules

- Each pitfall must have all four fields populated.
- "Detection" must give a concrete grep / lint command, not advice.
- If a pitfall corresponds to an audit finding, cite the FIND-NNN.

## Acceptance

- All 10 required pitfalls present.
- Each has the four-field structure.
- ≥3 pitfalls cite a real audit finding.
