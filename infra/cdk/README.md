# STYNX CDK

Standalone AWS CDK app for the STYNX reference environment.

## Commands

```sh
npm --prefix infra/cdk ci --cache /tmp/stynx-npm-cache
npm --prefix infra/cdk run build
npm --prefix infra/cdk test
cd infra/cdk && npm_config_cache=/tmp/stynx-npm-cache npm exec -- cdk synth -c env=dev
```

This package intentionally uses its own `package-lock.json` and is not part of
the root pnpm workspace.

## Environments

Environment configuration is explicit in `lib/config/{dev,stage,prod}.ts`.
Each environment supplies account id, regional workload region, domain name,
hosted zone id/name, regional ALB certificate ARN, capacity, database, Redis,
and alarm settings.

## Edge Stack

`EdgeStack` is synthesized in `us-east-1` for CloudFront, WAFv2 global scope,
and the CloudFront ACM certificate. The regional `ComputeStack` still owns the
ALB and its regional certificate.

Deployment prerequisites:

- The Route 53 hosted zone named by `hostedZoneId` and `hostedZoneName` already
  exists and is deployable from the target account/role.
- The `domain` value is delegated to that hosted zone.
- The regional `certArn` in environment config is for the ALB listener in the
  workload region. EdgeStack creates its own DNS-validated CloudFront
  certificate in `us-east-1`.
- If DNS is owned by a separate platform account, create or share the hosted zone
  before deploying EdgeStack; do not replace the config with hard-coded records.

EdgeStack outputs:

- `CloudFrontDistributionId`
- `CloudFrontDomainName`
- `EdgeWebAclArn`
- `EdgeCertificateArn`
- `EdgeHostedZoneId`
