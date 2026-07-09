# Do Not Extract Into stynx

## Business/Domain Exclusions

- Domain permission catalogs:
  - `../sgp/source/backend/src/iam/permissions/permission-catalog.ts`
- Product role policy constants:
  - `../pec/src/@core/security/role-policies.ts`
- Product-specific workflow semantics:
  - PORM-specific Flow rule catalogs, product approval semantics, and UI flows remain local to `../porm`.
  - The generic Flow machinery has been extracted into `@stynx-nyx/flow` and `@stynx-web/angular-flow`; do not copy PORM-specific policies back into the framework packages.
  - Generic Flow form execution behavior now belongs in stynx when it is domain-neutral: typed answer controls, serialization, waiver entry, signal freshness, DML audit, and route-access E2E proof are implemented in the Flow package/reference baseline.
- Domain entities and bounded-context services:
  - `../porm/backend/src/porm/**`
  - `../pec/src/pec/**`
  - `../sgp/source/backend/src/rh/**`

## Storage/Document Exclusions

- Ownership semantics and lifecycle rules in app document modules:
  - `../porm/backend/src/core/storage/*document-record.service.ts`
  - `../pec/src/pec/documents/documents.service.ts`
  - `../sgp/source/backend/src/documents/documents.service.ts`

## Frontend Exclusions (for this migration stage)

- product-specific UX and callback flows:
  - `../porm/frontend/src/app/**` outside the generic Flow host package contract
  - `../sgp/source/frontend/src/app/features/**`
- Flow host-store orchestration is not a default extraction target. Add a shared Angular store only if package-owned Flow screens need centralized graph/form/task state, selection, loading, refresh, and error handling.

## Principle

Extract shared mechanisms only; keep product semantics local.
