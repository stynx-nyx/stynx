# 05 — Resolve `@stynx/privacy` I3 violation

**Closes:** FIND-010 (BLOCKER), FIND-017.
**Branch:** `audit-remediation/05-privacy-i3`.
**Spec:** I3 (§1.3), §9 (LGPD), §21.

## Why

`packages/privacy/src/privacy-object-store.service.ts` imports
`S3Client`, `GetObjectCommand`, `PutObjectCommand` directly. I3 states:
"All object operations go through `@stynx/storage`." Privacy is a
first-party STYNX module and is not granted an exception in the spec.

## What to do

Pick path A (preferred) or path B with an ADR.

### Path A — route through `@stynx/storage` (preferred)

1. Identify the operations privacy needs: object read for export,
   object overwrite/delete for erasure, listing under tenant prefix.
2. If `@stynx/storage` lacks any of these, extend its public surface
   minimally — keep the API explicit (e.g. `eraseObject`,
   `streamObject`).
3. Rewrite `privacy-object-store.service.ts` to call
   `@stynx/storage`'s service. Remove `@aws-sdk/client-s3` from
   `packages/privacy/package.json`.

### Path B — document the exception

1. Write `specs/STYNX-ADR-003-privacy-direct-s3.md` describing why
   privacy bypasses storage (cross-tenant erasure scope, IAM
   privilege, etc.) and why a single-purpose escape hatch is safer
   than widening `@stynx/storage`.
2. Patch `specs/STYNX-SPEC-v0.6.md` §1.3 I3 to reference ADR-003.
3. Add an ESLint allowlist comment in
   `privacy-object-store.service.ts` referencing ADR-003.

## Acceptance

- Either: `grep '@aws-sdk/client-s3' packages/privacy/src` is empty,
  **or** an ADR-003 file exists and §1.3 I3 references it.
- `pnpm doctor` (post-prompt-02) reports I3 as PASS.
- The ESLint rule from prompt 07 does not flag the file (allowlisted
  with comment) or finds nothing to flag (path A).

## Verify

```
grep -r "@aws-sdk/client-s3" packages/privacy/src
pnpm doctor
pnpm --filter @stynx/privacy test
```
