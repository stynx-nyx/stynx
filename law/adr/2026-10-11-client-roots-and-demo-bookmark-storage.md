---
adr_id: ADR-DOMAIN-STORAGE-0001
title: Bind explicit client roots and isolate existing demo bookmark storage
status: accepted
date: 2026-10-11
authors: ['Architect']
tags: [authority, domain, database, tenancy, rls]
---

# ADR-DOMAIN-STORAGE-0001 — Client roots and demo bookmark storage

## Authority and scope

The Owner's [STYNX 1.6.0 mandate](2026-10-10-minor-release-1.6.0.md) includes
complete tenant isolation and real six-root HTTP observations. This decision
implements the pinned Constitution 1.0.2 Article 6 extension mechanism using the
exact published DEVAI 2.5.0 package adopted in
[ADOPTION-0020](2026-10-11-devai-2.5.0-adoption.md). It supplies no permission to
weaken authority, tests, release gates or workload requirements and no advance
storage, runtime, provider or performance PASS.

Adopter policy 1.6.2 explicitly declares the single-segment roots `domain`,
`reference`, `test` and `tools`. No other root is inferred or granted. The root remainder
is Engineer, including implementation documentation. Inspector selectors retain
the published test defaults, add the executable `.e2e` and `.wiring-spec`
suffixes, and explicitly cover every existing central test subtree: `db`,
`packages`, `perf`, `scripts` and `support`. Architecture selectors name
`schema.ts`, the historical demo migration, numbered demo forward migrations
and reference PostgreSQL definitions. Architecture takes precedence over test;
test takes precedence over the Engineer remainder. These selectors are relative
to each declared root and use the published fixed precedence, not an override
of any core row. New roots or architectural forms require a prospective policy
amendment and registered rebind.

The numbered demo DDL is an Architect-owned schema definition. Its installation
and read-only verification implementation remains Engineer-owned. Inspector
owns both colocated and central conformance tests. Bind only with the installed
published CLI's `init bind --target . --adopter-policy
law/policy/devai-adoption.json --as-role architect --write --format json`.
Never hand-edit `.devai/config`. Inspect the generated receipt, extension digest,
complete changed target roster and a subsequent Doctor result. Preserve all
existing sensor inputs, thresholds, N/A declarations, observations and proof-chain
bytes. If a generated workflow changes, the ordinary exact-commit CI receipt
requirement applies.

The explicit `tools` root includes the migration-linter implementation as Engineer
and its colocated tests as Inspector. Its catalog privilege inquiry classifier
must distinguish literal privilege-name data from executable destructive SQL.
The forward migration's `pg_catalog.has_table_privilege` inquiry mentioning
TRUNCATE exposed an actual LINT005 false positive. Repair the producer with
independent regressions retaining real destructive DDL and dynamic EXECUTE
negative witnesses; no invented destructive-approval marker or renamed SQL
string replaces that correction. This finite root addition grants no other
missing repository roots.

## Forward storage contract

Install the unchanged `domain/demo-bookmark/db/migration.sql`, then
`domain/demo-bookmark/db/0002_tenant_rls.sql`, through a closed ordered installer.
The forward migration runs transactionally as the existing `stynx_owner` role,
requires existing direct-login restricted `stynx_app` and `stynx_reader` roles,
and refuses elevated role attributes, elevated transitive membership, reader
membership in the application role and unknown pre-existing policies. It does
not create credentials or accept arbitrary SQL, owner connections, migrations
or role substitutions from an HTTP request.

Both existing tables remain owned by `stynx_owner` with ENABLE and FORCE RLS.
The application role receives only schema USAGE and SELECT/INSERT/UPDATE/DELETE;
the reader receives only schema USAGE and SELECT. PUBLIC receives neither schema
access nor table/column access. Effective inherited and column privileges are
checked, including application column REFERENCES and reader column writes.
Unknown or unrevokable privilege paths cause transactional refusal. PostgreSQL
16 remains supported by the actual reference composition: MAINTAIN is checked
only on servers that support that privilege, without omitting any older
privilege. The SQL inquiry functions' literal `public` denotes the PUBLIC
pseudo-role on both PostgreSQL 16 and 18.

Bookmark visibility and write checks require the row tenant to equal the
transaction's nonempty `app.tenant_id`; missing/empty context sees no rows and
cannot insert. Invalid UUID context refuses. Tag visibility and writes follow
the real parent bookmark and its RLS tenant boundary. No invented tenant column
or tenant/user FK is added. Soft-deleted parents remain tenant-scoped history;
the existing HTTP services retain their separate deleted-row filtering. HTTP
still requires verified principal/tenant admission, normal tenant/actor context
and reader/app transactions; owner installation authority never enters the
request worker.

Preserve every existing ID, timestamp, sequence, URL, note, tag and deleted row.
Keep the actual compound tag key and parent-delete cascade, existing active URL
uniqueness and cross-tenant URL reuse. Historical SQL and seed bytes remain
unchanged. Repeated installation is idempotent only for the accepted shape;
unknown objects, policies or unsupported role/privilege states must not be
silently reconciled.

## Historical model differences

The actual blueprint is `product/drafts/blueprints/demo-bookmark.json`; the old
migration comment names a nonexistent earlier location. The blueprint declares
only tag-to-bookmark cascade. Existing Drizzle declarations additionally name
tenant/user FKs absent from both blueprint and historical SQL. Historical tag
storage is TEXT, whereas blueprint/Drizzle name varchar(64). The blueprint's
unique URL index description also omits the historical SQL's active-row
predicate. This amendment preserves the installed storage shape and records
these discrepancies rather than claiming model equivalence, narrowing existing
stored tags, adding production constraints or editing the Owner blueprint.
Any later model reconciliation needs its own explicit consistency decision and
populated upgrade evidence. The read-only verifier must report these existing
differences truthfully.

## Independent acceptance

Require fresh installation and populated upgrade, repeat installation,
transactional rollback, exact historical-data reconciliation, actual owners,
ENABLE/FORCE flags, policy bodies/roles and complete effective grants. Exercise
actual direct restricted app/reader logins for both tenants, missing/empty/wrong
context, every CRUD operation on both tables, reader column-only grant and
inherited-privilege negatives. Retain actual tag key/cascade, soft deletion and
active uniqueness checks. The verifier inspects all relevant table/column and
schema privileges, PUBLIC access, role attributes, membership and policies;
catalog inspection does not replace direct-login negative witnesses.

The fixed installer/verifier, actual migration tests and owned full application
observations remain separate implementation and evidence obligations. Binding
an authority source or passing a local fixture does not fill any NULL admission
floor or establish production provider compatibility. Keep
`readiness_promoting=false` and historical 1.5.7 evidence unchanged.
