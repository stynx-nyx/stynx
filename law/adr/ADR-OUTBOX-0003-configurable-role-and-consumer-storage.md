---
adr_id: ADR-OUTBOX-0003
title: Configurable application role, consumer-owned outbox storage and named destinations
status: accepted
date: 2026-10-05
authors: ['Architect']
tags: [stynx, outbox, data, tenancy, rls, security, detran]
supersedes: ADR-OUTBOX-0002 fixed application role name and platform-only storage decisions only
---

# ADR-OUTBOX-0003 — Configurable application role, consumer-owned outbox storage and named destinations

**Status:** Accepted. This ADR is specification only. It authorizes no source,
test, migration or workflow change by itself, and it is no release evidence.
**Authority:** Architect, recording the Owner decisions of 2026-10-05 on
stynx-nyx/stynx#316 and stynx-nyx/stynx#320 (DETRAN C-0002, consumer round
R-0022, contract CTG-0008).
**Amends:** [ADR-OUTBOX-0002](ADR-OUTBOX-0002-event-log-and-delivery.md). Every
ADR-OUTBOX-0002 decision that this ADR does not name stays in force.
**Related:** [ADR-MOBILE-OFFLINE-0003](ADR-MOBILE-OFFLINE-0003-queue-states-and-consumer-storage.md)
takes the same consumer-owned storage stance for `offline.*` (its decision D6).

## Context

STYNX 1.5.3 (`main@2505251f`) closed UPS-OBX-04, UPS-OBX-05 and UPS-OBX-09.
Five DETRAN requests could not be delivered inside ADR-OUTBOX-0002:

| Request    | Issue | What blocks it in 1.5.3                                                             |
| ---------- | ----- | ----------------------------------------------------------------------------------- |
| UPS-OBX-10 | #320  | The application SQL role name `stynx_app` is a literal in code and in a trigger     |
| UPS-OBX-08 | #316  | Outbox DDL is only available inside platform migrations that also rewrite `audit.*` |
| UPS-OBX-03 | #316  | `cutoverLegacyMessages()` covers the two default tables only                        |
| UPS-OBX-11 | #320  | One dispatcher per module; no destination name; no rule for deliveries left behind  |
| UPS-OBX-07 | #316  | Pending in PR #343 (`feat/detran-15x-next-slice`); not decided here, see D4         |

DETRAN connects as `role_app_backend`, uses `auth.tenants` as its tenant table,
keeps its own `audit.*`, and applies DDL from a closed inventory. Under that
role every published append, stream read and `requireActor` transaction fails
today, so DETRAN cannot call the ports that 1.5.3 shipped for UPS-OBX-04 and
UPS-OBX-05, nor the tenant-scoped dispatch of UPS-OBX-07.

### Verified change surface (`main@2505251f`)

The literal `stynx_app` is compared with `current_user` at three runtime sites
and one trigger:

| Site                                                                | Use                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/data/src/database.ts:285`                                 | `Database.assertLiveCommandIdentity`, reached by `TxOptions.requireActor` |
| `packages/outbox/src/outbox.service.ts:171`                         | `appendManyInTransaction`, also used by `appendInTransaction`             |
| `packages/outbox/src/event-stream-source.ts:17`                     | `OutboxEventStreamSource.onPrimary`                                       |
| `packages/data/migrations/platform/0022_outbox_request_path.sql:14` | trigger function `outbox.guard_app_attempt_completion()`                  |

`packages/outbox/src/outbox.service.ts:359` and `:559` name the role in
comments only. `packages/backend/src/transactional-command/transactional-command.ts:488`
reaches the data site through `requireActor`. `packages/offline-sync/src` has
no role-name comparison.

Grants and policies name the role in historical migrations, which are never
edited: `0018_outbox.sql:7`, `:81-90`; `0021_outbox_event_log.sql:125-161`
(eight policies `TO stynx_app`, narrowed grants); `0022_outbox_request_path.sql:3-7`
(column-level `UPDATE` grant on `outbox.event_attempts`). `0021` also carries
`audit.*` statements from line 163 onward, including policies at `:555-559`.

The `0022` trigger applies its checks only inside `IF current_user = 'stynx_app'`.
For any other role name the function returns `NEW` unchecked, so a renamed
application role would silently lose the attempt-immutability guard.

## Decision

Decision identifiers are stable. Cite them as `ADR-OUTBOX-0003 D1` to `D5`.

### D1 — Configurable application SQL role (UPS-OBX-10, option A)

**Amends** the ADR-OUTBOX-0002 "Decision" paragraphs wherever they fix the
application role by name ("`now()` is a short independent app-role
transaction", "`now`, `findById`, `listSince` use the primary, FORCE RLS and
actual SQL tenant identity"). The guarantees stay; only the name becomes
configuration.

1. **One option.** `StynxDataModuleOptions` (`packages/data/src/tokens.ts`)
   gains one optional application role name, proposed `appRoleName`, default
   `'stynx_app'`. The Engineer may rename the option; the behaviour is fixed.
   `Database` exposes the resolved name read-only. No other package adds its
   own role-name option.
2. **Inheritance.** The three runtime sites above compare `current_user` with
   the resolved name. After the change no `'stynx_app'` literal remains on a
   request path in `packages/data/src` or `packages/outbox/src`. Without the
   option, behaviour is byte-identical to 1.5.3.
3. **Name handling.** The name is compared by exact string equality with
   `current_user`. It is validated at module construction as a non-empty
   PostgreSQL identifier of at most 63 bytes. It is never concatenated into
   SQL; any statement that needs it passes it as a bound parameter or through
   identifier quoting.
4. **Other guards preserved.** Every other check at those sites is unchanged
   and independent of the name: `trx.role` and `app.role` equal `app`,
   `app.tenant_id` present and equal to `Database.currentTenantId()`,
   `read committed`, writable transaction, primary (not in recovery), actor
   present under `requireActor`. FORCE RLS and "actual SQL tenant identity"
   are unchanged.
5. **Distinguishable refusal.** A role other than the configured one is still
   refused with the existing typed errors (`OutboxEventTransactionError`,
   `TransactionIdentityMismatchError`). Each gains an additive, typed reason
   that separates "wrong SQL role" from isolation, read-only, recovery, tenant
   and actor failures. No existing code, status or message is removed.
6. **Name-independent attempt guard.** A new forward platform migration (next
   free number, `0025` at the time of writing) replaces the body of
   `outbox.guard_app_attempt_completion()` with `CREATE OR REPLACE FUNCTION`.
   The trigger, its table and its timing stay. The new body applies the
   existing `0022` checks to **every role except the owner of
   `outbox.event_attempts`**, resolved from `pg_class.relowner` for `TG_RELID`
   and compared by role identity, not by membership. The exception keeps
   SQLSTATE `42501`; its message no longer names a role. `0022` is not edited.
   On a default installation the owner is `stynx_owner`, so owner-path
   completion is unchanged and `stynx_app` is guarded exactly as before.
7. **Mandatory role property check.** Before the application pool serves its
   first app-role transaction the data module verifies, on an application
   connection, that:
   - `current_user` equals the configured name;
   - the role is not a superuser (`rolsuper` false);
   - the role has no `BYPASSRLS` (`rolbypassrls` false);
   - when `session_user` differs from `current_user` (a connection that
     assumes the role with `SET ROLE` or `options=-c role=…`), `session_user`
     also satisfies the two attribute checks.

   The outbox module additionally verifies at bootstrap that the application
   role neither owns nor is a member of the role that owns any relation in
   the closed object list of D2.

   A failed check prevents startup with a typed configuration error that names
   the failed property and never echoes connection secrets. If the database is
   unreachable during bootstrap the check is not skipped: it runs on the first
   app-role acquisition, which fails typed until the check has passed. The
   check applies to the default `stynx_app` as well.

8. **Grants and policies for a non-default role.** Historical migrations keep
   `TO stynx_app`. A different role therefore matches no outbox policy and,
   under FORCE RLS, is denied every row: the failure is closed, not a leak.
   The supported way to give a configured role its outbox grants and policies
   is the role-binding part of the D2 artifact. The platform migration runner
   is not parameterized by this ADR.

### D2 — Standalone, parameterized, idempotent outbox DDL artifact (UPS-OBX-08, option B)

**Amends** ADR-OUTBOX-0002 "Migration ≥0021 creates storage …" and "Engineer
updates canonical DDL, seeds and DB tests; no historical migration is edited".
The second sentence stays true. Platform migrations remain the canonical
source; consumer-owned DDL becomes a second supported mode.

1. **Artifact.** `@stynx-nyx/outbox` publishes a standalone outbox DDL
   artifact in its tarball. It is **generated** from platform migrations
   `0018_outbox.sql`, `0021_outbox_event_log.sql`, `0022_outbox_request_path.sql`
   and the D1 migration, and contains only objects in schema `outbox`. No
   `audit.*` statement of `0021` is included. No historical migration is
   edited.
2. **Two parts.** The artifact has an **objects** part (schema, types,
   sequence, tables, indexes, functions, triggers, FORCE RLS) and a
   **role-binding** part (grants, revokes and policies for one application
   role and one optional reader role). The role-binding part is applicable on
   its own, including on a platform-migrated database, to bind an additional
   application role.
3. **Parameters.** Owner role, application role, optional reader role, and
   the tenant table for the foreign keys (schema-qualified table and its
   `uuid` key column). The schema name `outbox` is fixed, because the service
   SQL names it. Parameters are identifiers only; the renderer validates and
   quotes them, and its output is deterministic. Defaults reproduce the
   platform (`stynx_owner`, `stynx_app`, `stynx_reader`, `tenancy.tenants(id)`).
4. **Idempotent.** Applying the rendered artifact twice, or on top of a
   database that already holds the objects, produces no error and no change.
   It never drops a table, column, sequence or row, and never rewrites data.
5. **Closed object list.** The package publishes a machine-readable manifest
   of every database object the service SQL references (relations, columns,
   `outbox.event_order_seq`, `outbox.event_uuid`, `outbox.reject_event_mutation`
   and trigger `outbox_events_immutable`, `outbox.guard_app_attempt_completion`
   and its trigger, the legacy tables and the columns of `outbox.messages`
   used in event mode, the `outbox.legacy_ownership` marker), with the minimum
   grants per role. The transaction-local setting `stynx.audit_chain_key` and
   the tenant advisory lock are listed as non-relational dependencies.
6. **Drift guard.** Two sensors are mandatory. First, the artifact and the
   manifest regenerate to identical bytes from the platform migrations.
   Second, on real PostgreSQL the catalog of the closed list in a
   platform-migrated database equals the catalog produced by the artifact
   rendered with default parameters. A platform migration that changes an
   outbox object without regenerating the artifact fails both.
7. **Reference verifier.** A sensor fails when the service SQL references a
   database object that is not in the manifest.
8. **Supported mode.** A database is in supported consumer-owned mode when the
   D3 verifier passes for the installed package version. In this mode:
   - STYNX claims the ADR-OUTBOX-0002 outbox guarantees (append, dedup,
     per-tenant clock, commit-monotonic cursor, delivery, attempt and ACK
     ledgers, RLS isolation).
   - STYNX does **not** claim the ADR-OUTBOX-0002 audit-chain linearization.
     That guarantee exists only where the platform `audit.*` of migration
     `0021` or later is installed. The consumer owns its audit chain and its
     lock order relative to the outbox tenant clock.
   - `cutoverLegacyMessages()` is not supported. Its audited-table inspection
     resolves `audit.fn_row_change()` (`outbox.service.ts:276`), which does
     not exist there. The Engineer makes that call fail with a typed error
     before any SQL in a database without that function.

### D3 — No custom-table cutover in 1.5.x; storage contract and verifier (UPS-OBX-03, option C)

**Confirms** ADR-OUTBOX-0002: "`OutboxService.cutoverLegacyMessages()` is an
explicit, idempotent opt-in for the default tables only; custom
`table`/`ackTable` options fail typed before mutation and remain legacy." That
sentence is not amended.

1. **Declined for 1.5.x.** STYNX adds no cutover of a consumer's custom
   storage in the 1.5 line. DETRAN keeps the transfer its Owner authorized
   (DETRAN OD-R22-16). STYNX does not execute, parameterize or certify that
   transfer's mapping.
2. **Storage contract.** STYNX publishes a supported, versioned outbox storage
   contract: the D2 manifest plus the write invariants a consumer-performed
   transfer must respect. At minimum:
   - rows are written by the owner role, outside any request path, with
     appenders stopped or while holding the tenant clock row;
   - `outbox.events` rows are inserted once and never updated or deleted;
   - `(tenant_id, idempotency_key)` stays unique and each row keeps its
     source tenant;
   - `created_at` has millisecond precision, and `outbox.tenant_clock.last_ms`
     for the tenant is at least the greatest transferred `created_at`, so
     every later append sorts after every transferred row in the public
     cursor `(createdAt, id)`;
   - delivery rows use only the published status vocabulary; a source row
     that was confirmed is written `ACKED` and is never redelivered;
   - attempt and ACK history is written with its original instants and is
     never fabricated: evidence that the source did not keep stays null.
3. **Verifier.** STYNX publishes a verifier that a consumer runs against a
   live database. It checks structure (every manifest object, column type,
   constraint, index, trigger, FORCE RLS flag, policy and grant for the
   configured roles; no application-role ownership) and the data invariants of
   item 2 that are decidable from stored rows. It is read-only, runs as the
   owner role, reports per check and per tenant, and exits non-zero on any
   failure. A pass is the definition of "supported" in D2 item 8.
4. **Deferred, not rejected.** A generic import port is deferred to a later
   minor release: the platform inserts each imported fact with a new UUIDv7
   and records the source identifier in a durable legacy-id map, in the
   manner of `outbox.legacy_event_map`. No design beyond that sentence is
   decided here, and nothing in 1.5.x depends on it.

### D4 — Named-destination registry (UPS-OBX-11, option A)

Additive to ADR-OUTBOX-0002. Its rule "Delivery claims only the oldest
nonterminal event for each aggregate" is **not** amended.

1. **Dependency.** The entity selector that decides which events are
   dispatchable (UPS-OBX-07) is pending in PR #343 and is not decided by this
   ADR. D4 is implemented only after that selector is on `main`, and is
   written against what merged.
2. **Registry.** `OutboxModuleOptions` gains an optional registry of named
   destinations. Each entry has a name, an entity selector (exact names and
   literal prefixes, never a pattern language) and an optional
   `OutboxDispatcherPort`. A destination without its own port uses the module
   `dispatcher`.
3. **Sugar only.** A destination name expands to its entity set. Dispatch,
   tenant-scoped dispatch and queue health accept a destination name wherever
   they accept an entity filter. No table, column, status or stored
   destination is added. A delivery row does not record a destination.
4. **One destination per entity.** An entity that matches more than one
   destination, or a destination whose entities the selector makes
   non-dispatchable, is a configuration error at bootstrap.
5. **Ordering unchanged.** Blocking stays per aggregate `(entity, entity_id)`
   over existing delivery rows (`outbox.service.ts:431-437`, `:784`). It is
   never per destination.
6. **Default.** Without a registry, behaviour is that of the release the
   registry ships on top of.

### D5 — Deliveries created before an entity lost its destination (UPS-OBX-11, option C)

1. **No new terminal status now.** The `CHECK` on `outbox.event_delivery.status`
   (`0021_outbox_event_log.sql:41`) and the union `OutboxEventDeliveryStatus`
   (`packages/outbox/src/types.ts:176`) are unchanged. STYNX ships no retire,
   cancel or purge operation for such deliveries.
2. **Request to the consumer.** STYNX asks DETRAN to declare item 5 of
   UPS-OBX-11 ("Entregas já existentes") without object, because DETRAN has no
   delivery in the published queue: its dispatch queues still live in its own
   tables.
3. **If DETRAN does not agree.** A `RETIRED`-style terminal status needs a
   further amendment to this ADR before any code. That amendment must decide
   at least: the forward migration that widens the status `CHECK`; the
   widening of the published status union (an output-type break for
   exhaustive consumers); whether a retired predecessor releases the
   aggregate, since the claim predicate blocks on every predecessor whose
   status is not `ACKED`; and how reads, retry and queue health treat the new
   status.

## Consequences

- **Compatibility.** All of D1 to D4 is additive. Default role, default
  storage and "no registry" keep 1.5.3 behaviour. The D1 property check is new
  fail-closed behaviour for every installation: an application role that is a
  superuser, has `BYPASSRLS`, or owns outbox relations now prevents startup.
  That is intended and is declared in the changeset and the migration guide.
- **Migration.** One new forward platform migration (D1 item 6). Dependency
  bumps and new public options move the API baselines of `@stynx-nyx/data` and
  `@stynx-nyx/outbox`; the Architect rebinds them and the trace after
  implementation. Root `test/db` and seed obligations apply to the new
  migration.
- **Security and RLS.** D1 is security-critical. The delivery review must
  cover the trigger replacement, the property check and identifier handling.
  FORCE RLS stays on every outbox relation. A role without bound policies is
  denied, never widened.
- **Scope of the rename.** D1 plus D2 make a non-default role usable for the
  outbox, and D1 alone makes `requireActor` name-independent. They do not
  rebind the other platform schemas (`core`, `tenancy`, `auth`, `audit`,
  `flow`, `jobs`, `worklist`, `notifications`), whose grants name `stynx_app`
  in historical migrations, and `0001_roles.sql` still creates `stynx_app`.
  A consumer that uses `@TransactionalCommand` under another role must grant
  that role the platform objects the command path touches.
- **Contracts.** `docs/framework/contracts/outbox-api.md` is updated by the
  Architect with the implementation, not by this ADR.

## Verification obligations

All database evidence is real PostgreSQL with FORCE RLS and two tenants.

| Decision | Required evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1       | Application role with a name other than `stynx_app` (`NOSUPERUSER NOBYPASSRLS`): append, idempotent replay and conflict accepted; `listSince`, `findById`, `now` accepted and tenant-isolated; a `requireActor` transaction accepted. The same suite under `stynx_app` with no option stays green. Typed refusal under the owner role, under a role that is not the configured one, in `repeatable read`, in a read-only transaction and without `app.tenant_id`. |
| D1       | Attempt guard under the non-default role: completing its own `CLAIMED` attempt succeeds; every mutation the `0022` guard forbids fails with `42501`; the owner path still completes attempts. Upgrade from a database at `0024` and creation from empty both reach the same function body.                                                                                                                                                                        |
| D1       | Property check: startup refused for a superuser role, for a `BYPASSRLS` role, for a role that owns an outbox relation, for a member of the owning role, and for a privileged `session_user` behind `SET ROLE`; accepted for a conforming role; not skipped when the database is unreachable at bootstrap.                                                                                                                                                         |
| D2       | Artifact applied to a database with no STYNX `audit.*`, a tenant table other than `tenancy.tenants` and roles other than the defaults; the UPS-OBX-01 and UPS-OBX-02 suites pass there under the configured role; second application is a no-op; both drift sensors and the reference verifier fail on a seeded divergence.                                                                                                                                       |
| D3       | Verifier passes on a platform-migrated database and on an artifact-applied database; fails, naming the check, for a missing policy, a table without FORCE RLS, an application-owned relation, a tenant clock behind a transferred row, and a delivery status outside the vocabulary.                                                                                                                                                                              |
| D4       | Two destinations, two tenants: dispatch by destination A never claims, counts or sends a delivery of destination B; each destination's port receives only its entities; overlapping selectors refuse to boot; with no registry the pre-registry suite is unchanged.                                                                                                                                                                                               |
| D5       | None. No behaviour is added.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Implementation order

1. **D1 first.** It unblocks every outbox port DETRAN already has in 1.5.3
   and the tenant-scoped dispatch of UPS-OBX-07. Order inside D1: migration
   and guard sensor, then the option and the three sites, then the property
   check.
2. **D2**, which must include the D1 trigger function, then **D3** (contract
   text and verifier share the D2 manifest).
3. **D4**, after PR #343 has merged.
4. **D5** needs no implementation.

## Deferred and declined

- Declined for 1.5.x: custom-table cutover (D3 item 1).
- Deferred to a later minor: generic import port with new UUIDv7 identifiers
  and a legacy-id map (D3 item 4).
- Not decided: a terminal status for stranded deliveries (D5 item 3);
  ordering or blocking per destination; a parameterized platform migration
  runner; rebinding of non-outbox platform schemas to another role.

## Open points for Owner confirmation

1. **Guard predicate (D1 item 6).** The Owner chose "a name-independent
   guard" without fixing the predicate. This ADR writes the most conservative
   one: every role except the table owner is guarded. Confirm, or name the
   roles that must stay exempt.
2. **`session_user` (D1 item 7).** The check also constrains the login role
   behind `SET ROLE`. If DETRAN's login role is privileged, startup is
   refused until that changes. Confirm the stricter rule.
3. **Platform-migrated database with a renamed role.** The decision makes the
   outbox usable (role-binding part of D2) but leaves the other platform
   schemas bound to `stynx_app`. Confirm that a full platform rename is out of
   scope for 1.5.x.
4. **Preserved identifiers (D3).** DETRAN's acceptance text for UPS-OBX-03
   requires the same `id` and `created_at` after cutover. Option C does not
   deliver that through STYNX, and the deferred import port assigns new
   UUIDv7 identifiers, so it would not deliver it either. A DETRAN transfer
   that keeps its legacy identifiers writes event ids that the platform did
   not generate. Confirm that the storage contract admits such ids under the
   invariants of D3 item 2, and that UPS-OBX-03 closes for DETRAN on contract
   plus verifier.
5. **Duration of the DETRAN exception.** OD-R22-16 is recorded by DETRAN as
   transitional "until 1.5.x". Under option C it has no STYNX replacement in
   the 1.5 line. The DETRAN Owner needs to extend or make it permanent.
6. **Audit-chain claim in consumer-owned mode (D2 item 8).** Confirm that
   STYNX claims no audit-chain linearization where the consumer keeps its own
   `audit.*`.
7. **Boot-time verification.** The D3 verifier is an explicit operation. No
   runtime storage-version marker or automatic boot verification is decided.
   Confirm, or request one.
8. **UPS-OBX-11 item 5.** D5 depends on DETRAN declaring it without object.
