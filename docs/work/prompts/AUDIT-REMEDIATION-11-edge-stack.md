# 11 — Add EdgeStack to `infra/cdk`

**Closes:** FIND-005 (MAJOR).
**Branch:** `audit-remediation/11-edge-stack`.
**Spec:** `specs/STYNX-CDK-SKELETON.md`.

## Why

`infra/cdk/lib/` has 6 of 7 expected stacks. `EdgeStack` (CloudFront +
WAF + ACM) is missing. The current stack set has no CDN/WAF.

## What to do

1. Read the EdgeStack section of `specs/STYNX-CDK-SKELETON.md`.
2. Create `infra/cdk/lib/edge-stack.ts` with:
   - ACM cert in `us-east-1` (CloudFront global).
   - CloudFront distribution fronting the ALB from `ComputeStack`.
   - WAF v2 web ACL with the spec'd managed rule groups (AWS managed
     core rule set, known bad inputs, IP reputation; rate-based rule
     per SPEC §15).
   - Route 53 alias record(s).
3. Wire it into `bin/cdk.ts` for `dev`, `stage`, `prod`.
4. Cross-account considerations per SPEC §17 — region pinning to
   `us-east-1` for ACM, `sa-east-1` for the rest.
5. Run `cdk synth` for each environment; commit any required
   `cdk.context.json` updates.

## Acceptance

- `infra/cdk/lib/edge-stack.ts` exists with the EdgeStack class.
- `cd infra/cdk && pnpm cdk synth -c env=dev` succeeds.
- Synth output lists `EdgeStack` resources for all three envs.
- The CloudFront distribution's origin is the ALB DNS from
  `ComputeStack` (no hard-coded values).

## Verify

```
cd infra/cdk
pnpm cdk synth -c env=dev > /tmp/dev.synth && grep CloudFrontDistribution /tmp/dev.synth
pnpm cdk synth -c env=stage > /dev/null
pnpm cdk synth -c env=prod  > /dev/null
```
