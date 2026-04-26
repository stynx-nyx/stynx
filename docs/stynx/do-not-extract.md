# Do Not Extract Into stynx

## Business/Domain Exclusions
- Domain permission catalogs:
  - `../sgp/source/backend/src/iam/permissions/permission-catalog.ts`
- Product role policy constants:
  - `../pec/src/@core/security/role-policies.ts`
- Domain policy engines/workflows:
  - `../porm/backend/src/flow/services/flow-policy.service.ts`
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
  - `../porm/frontend/src/app/**`
  - `../sgp/source/frontend/src/app/features/**`

## Principle
Extract shared mechanisms only; keep product semantics local.
