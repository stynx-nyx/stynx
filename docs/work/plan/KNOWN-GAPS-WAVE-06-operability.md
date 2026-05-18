# Wave 06 — Operability

**Roles:** Architect authors runbooks; Engineer wires checks.
**Branch suggestion:** `known-gaps/06-operability`.
**Primary gaps:** O-01, O-03, O-04, O-05, O-06, O-07, Doc-05.

## Purpose

Make a local operator able to run, observe, smoke-test, and recover the
reference deployment.

## Inputs

- `docs/KNOWN_GAPS.md` sections 6 and 8
- `docs/operations/**`
- `reference/{api,web}/Dockerfile` or active Dockerfiles
- `docker-compose*`
- metrics setup in reference API/backend packages
- `test/perf/k6/**`
- `docs/work/prompts/AUDIT-REMEDIATION-09-operability-docs.md`
- `docs/work/prompts/AUDIT-REMEDIATION-12-runtime-verification.md`
- `docs/work/prompts/AUDIT-REMEDIATION-13-cleanup-pr.md`

## Tasks

1. Add runbooks for:
   - tenant suspension;
   - LGPD erasure;
   - session revocation;
   - role rotation;
   - federation onboarding;
   - PostgreSQL backup/restore;
   - KMS/key recovery expectations;
   - Cognito or local-auth recovery.
2. Add Docker `HEALTHCHECK` to active reference API/web images.
3. Add `cognito-local` or documented local-auth substitute to compose.
4. Add metrics integration test that scrapes `/metrics` and asserts required
   metric names.
5. Verify k6 threshold semantics and CI wiring.
6. Add `pnpm smoke:local` for canonical local user journey.

## Acceptance

- Runbooks are present and actionable.
- Docker healthchecks fail when the app is unhealthy.
- Local auth composition is documented and runnable.
- Metrics, k6, and smoke have runnable commands and CI route.

## Verification

```sh
pnpm --filter @stynx/reference-api test
pnpm smoke:local
pnpm lint:workflows
pnpm build
git diff --check
```
