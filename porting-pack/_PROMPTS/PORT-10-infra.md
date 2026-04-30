# PORT-10 — Infrastructure Requirements

**Produces:** `porting-pack/10-INFRASTRUCTURE-REQUIREMENTS.md`.
**Depends on:** `_DISCOVERY.md`.
**Branch:** `porting-pack/10-infra`.

## Mission

Inventory of AWS resources, env vars, and secrets that any STYNX-
ported app needs. Not how to deploy — what to plan for.

## Read

- `specs/STYNX-CDK-SKELETON.md`.
- `infra/cdk/lib/*.ts`.
- `apps/reference-api/.env.example`.
- `apps/reference-api/docker-compose.yml`.

## Sections

```
# 10 — Infrastructure Requirements

## Required AWS services

| Service | Purpose | Stack | Notes |
|---|---|---|---|
| RDS Postgres | primary DB | DataStack | version per spec; RLS on |
| ElastiCache Redis | session + cache | DataStack | |
| S3 (per-env bucket) | object storage | StorageStack | KMS CMK |
| KMS CMK | envelope encryption | StorageStack | |
| Cognito User Pool | identity | IdentityStack | one per env |
| ECS Fargate + ALB | compute | ComputeStack | |
| WAF v2 + CloudFront | edge | EdgeStack | NOTE: EdgeStack absent in current code (FIND-005) |
| AMP (Prometheus) + AMG (Grafana) | observability | ObservabilityStack | |
| VPC + endpoints | network | NetworkStack | S3, Secrets, KMS, CloudWatch, ECR endpoints |

## Local-dev services (docker-compose)

- postgres:16-alpine
- redis:7-alpine
- localstack (S3 only)
- cognito-local NOTE: not present in current compose (FIND-029)

## Environment variables (consuming app)

Pulled verbatim from `apps/reference-api/.env.example`, with each
variable annotated:

| Variable | Required | Source | Notes |
|---|---|---|---|
| ... | ... | ... | ... |

## Secrets

- DB master password (Secrets Manager).
- App DB user password (`stynx_app`, `stynx_reader`).
- Cognito app client secret (if confidential client).
- KMS key ARNs for storage / envelope.
- STYNX session signing keypair (RS256).

## Network requirements

- VPC with public / private / isolated tiers.
- Interface endpoints (S3 gateway endpoint optional but recommended).
- ALB in public; Fargate tasks in private.
- RDS + Redis in isolated.

## Out of scope

- DR strategy.
- Cross-region replication.
- Backup retention policies (operations runbooks address these;
  see audit FIND-031 — currently absent).
- Ad-hoc analytics (read replicas, lake exports).
```

## Rules

- Verify every env var name against `apps/reference-api/.env.example`;
  do not invent.
- For EdgeStack, mark explicitly that the current repo is missing
  it (audit FIND-005). The consuming app may need to provision an
  external CDN/WAF until EdgeStack lands.

## Acceptance

- AWS-services and local-dev tables populated from real sources.
- Env-var table cites the .env.example file.
- Out-of-scope list present.
