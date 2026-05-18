# Wave 07 — Edge Infrastructure

**Role:** Engineer.
**Branch suggestion:** `known-gaps/07-edge-infrastructure`.
**Primary gap:** O-02.

## Purpose

Add the missing CDK edge stack without entangling it with package topology or
reference-app remediation.

## Inputs

- `docs/KNOWN_GAPS.md` section 6
- `docs/architecture/STYNX-CDK-SKELETON.md`
- `infra/cdk/**`
- existing CDK stacks and environment configuration
- `docs/work/prompts/AUDIT-REMEDIATION-11-edge-stack.md`

## Tasks

1. Inspect current CDK app and stack registration.
2. Implement `EdgeStack` with CloudFront, WAF, ACM, and expected outputs.
3. Keep environment-specific configuration explicit for dev/stage/prod.
4. Add tests or synth snapshots if the infra package already uses them.
5. Document deployment prerequisites and known external DNS/certificate
   assumptions.

## Acceptance

- `EdgeStack` appears in CDK synth for each supported environment.
- Resources match `STYNX-CDK-SKELETON.md`.
- Missing hosted-zone/certificate assumptions are documented, not hidden.

## Verification

```sh
pnpm --filter @stynx-internal/infra-cdk build
pnpm --filter @stynx-internal/infra-cdk test
pnpm --filter @stynx-internal/infra-cdk cdk synth
git diff --check
```
