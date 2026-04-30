# PORT-03 — Core Concepts (Glossary)

**Produces:** `porting-pack/03-CORE-CONCEPTS.md`.
**Depends on:** `_DISCOVERY.md`, `04-INVARIANTS-AND-CONTRACTS.md`.
**Branch:** `porting-pack/03-concepts`.

## Mission

Glossary that lets a consuming agent use STYNX terms correctly without
inventing synonyms. After reading, the agent should never write
"organization context" when it means "TenantContext".

## Required entries

For each term: 2–4 sentences, one concrete example, one file:line citation.

- Tenant / TenantContext / tenant_id (and what makes a column
  eligible to be tenant_id).
- Actor / ActorContext.
- Session, sid, perms_hash, generation.
- RequestContext.
- Tenant-scoped table, RLS policy.
- Live table vs archive table.
- Soft delete / hard delete / restore / cascade restore.
- FK annotations: `cascade`, `block`, `hide`.
- Permission key (`resource:action:scope`).
- Three database roles: `stynx_owner`, `stynx_app`, `stynx_reader`.
- GUCs: `app.tenant_id`, `app.actor_id`, `app.request_id`,
  `app.session_id`, `app.archive_move`.
- LGPD strategies: `nullify`, `hash_with_salt`, `tombstone_row`,
  `delete_row` (verify exact set against
  `16-SPEC-EXCERPTS/audit-model.md` and any code constants).
- System context / `withSystemContext`.
- Idempotency key.

## Format

```
### <term>

<2–4 sentence definition>

**Example:** <concrete example>

**Citation:** <file:line or spec §>
```

## Rules

- Definitions are operational, not philosophical. "What does an agent
  do with this term?" is the framing.
- Cross-link related terms inline: "see also [Tenant-scoped table](#tenant-scoped-table)".
- If a term name in the codebase differs from the spec, document
  both names and the canonical choice. Add a `[GAP]` line if the
  divergence is unresolved.

## Acceptance

- Every term in the list has an entry.
- Every entry has an example AND a citation.
- No term is defined twice.
