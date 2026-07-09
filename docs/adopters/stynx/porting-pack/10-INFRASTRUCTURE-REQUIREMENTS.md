# 10 — Infrastructure Requirements

> **Scope.** This file enumerates the infrastructure surface a consumer
> app must stand up to host a STYNX-based service. It is anchored to
> the CDK code at `infra/cdk/lib/` (HEAD on `clean/doc-pass`,
> 2026-04-27), the local-dev compose file at
> `reference/api/docker-compose.yml`, and the env-var inventory
> derived from `reference/api/src/app.module.ts` plus
> `packages/*/src/**/*.ts`.
>
> **Source baseline.** Every CDK citation references the file paths
> listed in `_DISCOVERY.md` §1 at commit
> `670d165253efd66113e338cd0c79d4c8fcbc8be7`. The CDK skeleton spec is
> `specs/STYNX-CDK-SKELETON.md` (843 lines, normative).
>
> **Out of scope at the head of this doc — confirmed at the foot.**
> Disaster recovery, cross-region replication, backup-retention policy,
> and ad-hoc analytics are not modelled here. Audit FIND-031
> (operations runbooks absent) is the live porting concern that
> survives the closure pass — see §6.

---

## 1. Required AWS services

The CDK app composes seven stacks. The skeleton spec describes six
(`specs/STYNX-CDK-SKELETON.md` §1) — `EdgeStack` (CloudFront +
Route 53 + WAF-CLOUDFRONT) was added during rationalization to close
audit FIND-005 and is now present at
`infra/cdk/lib/edge-stack.ts`. See §7 for full drift comparison.

| Service                                                      | Purpose                                                                               | CDK stack          | File path                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VPC (3-tier)**                                             | Network isolation. Public, app (PRIVATE_WITH_EGRESS), data (PRIVATE_ISOLATED) tiers.  | NetworkStack       | `infra/cdk/lib/network-stack.ts:14-23`         | CIDR + maxAzs from env config; prod gets one NAT per AZ, lower envs share one NAT.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **NAT Gateway(s)**                                           | Egress for the app tier.                                                              | NetworkStack       | `infra/cdk/lib/network-stack.ts:17`            | `natGateways: prod ? maxAzs : 1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **VPC Gateway Endpoint (S3)**                                | Cost-free private S3 access.                                                          | NetworkStack       | `infra/cdk/lib/network-stack.ts:25-27`         | Single endpoint; DynamoDB endpoint is omitted vs the spec sketch.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **VPC Interface Endpoints**                                  | Private path to AWS APIs. SECRETS_MANAGER, KMS, CLOUDWATCH_LOGS, ECR, ECR_DOCKER.     | NetworkStack       | `infra/cdk/lib/network-stack.ts:29-40`         | Five interface endpoints; metered.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **VPC Flow Logs → CloudWatch Logs**                          | Network forensics.                                                                    | NetworkStack       | `infra/cdk/lib/network-stack.ts:42-50`         | One-month retention; RETAIN in prod, DESTROY otherwise.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Cognito User Pool**                                        | User identity (one pool per environment).                                             | IdentityStack      | `infra/cdk/lib/identity-stack.ts:15-40`        | Self-signup OFF; email signin alias; MFA optional in prod, off elsewhere. Standard threat protection FULL_FUNCTION in prod, AUDIT_ONLY otherwise. Custom attribute `locale` only — **no `custom:tenant_id`** per SPEC §5.1.                                                                                                                                                                                                                                                            |
| **Cognito User Pool Client (SPA / PKCE)**                    | SPA OAuth client (no secret).                                                         | IdentityStack      | `infra/cdk/lib/identity-stack.ts:42-64`        | `userSrp` flow; authorization-code grant; 30-day refresh, 60-min access/id.                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Cognito User Pool Client (Admin)**                         | Backchannel admin client (with secret) for `cognito-idp:Admin*`.                      | IdentityStack      | `infra/cdk/lib/identity-stack.ts:66-72`        | `adminUserPassword` flow; `generateSecret: true` — secret must be retrieved post-deploy.                                                                                                                                                                                                                                                                                                                                                                                               |
| **RDS PostgreSQL 16.3 (single instance, optional Multi-AZ)** | Primary OLTP store.                                                                   | DataStack          | `infra/cdk/lib/data-stack.ts:43-63`            | T4G.MEDIUM hard-coded (skeleton spec uses `config.db.instanceClass` — see §7 drift). GP3 storage, encrypted, deletion-protected in prod, RETAIN in prod / SNAPSHOT otherwise.                                                                                                                                                                                                                                                                                                          |
| **RDS DB master Secret (Secrets Manager)**                   | `stynx_owner` master credential.                                                      | DataStack          | `infra/cdk/lib/data-stack.ts:33-41`            | Secret name `stynx/${env}/db/master`; 40-char generated password. **Rotation not configured in code** (skeleton calls for monthly rotation — drift, see §7).                                                                                                                                                                                                                                                                                                                           |
| **ECS Cluster (PgBouncer)**                                  | Hosts the PgBouncer pooler.                                                           | DataStack          | `infra/cdk/lib/data-stack.ts:65-68`            | ContainerInsights enabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **PgBouncer Fargate Service**                                | Transaction-mode pooler.                                                              | DataStack          | `infra/cdk/lib/data-stack.ts:78-113`           | `public.ecr.aws/bitnami/pgbouncer:1.24.1` image; 256 CPU / 512 MB; desiredCount 2 in prod, 1 elsewhere. Pool mode `transaction`. **Service-discovery / NLB endpoint not provisioned** — `pgBouncerEndpoint` is a hard-coded string `pgbouncer.${env}.stynx.internal:5432` (line 115).                                                                                                                                                                                                  |
| **ElastiCache Redis Subnet Group**                           | Subnets for Redis.                                                                    | DataStack          | `infra/cdk/lib/data-stack.ts:117-121`          | Bound to PRIVATE_ISOLATED subnets.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **ElastiCache Redis Parameter Group**                        | Redis 7 params.                                                                       | DataStack          | `infra/cdk/lib/data-stack.ts:123-130`          | `notify-keyspace-events Ex` (session expiry) + `maxmemory-policy volatile-lru`.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **ElastiCache Redis (CfnReplicationGroup)**                  | Sessions, rate-limit counters, idempotency cache, perms cache.                        | DataStack          | `infra/cdk/lib/data-stack.ts:137-152`          | Engine 7.1; at-rest + transit encryption; automatic-failover + multi-AZ in prod only; snapshot retention 7d prod / 1d elsewhere.                                                                                                                                                                                                                                                                                                                                                       |
| **KMS CMK (docs)**                                           | Server-side encryption for the docs bucket.                                           | StorageStack       | `infra/cdk/lib/storage-stack.ts:16-23`         | Alias `alias/stynx-docs-${env}`; rotation enabled; SYMMETRIC_DEFAULT / ENCRYPT_DECRYPT; RETAIN in prod.                                                                                                                                                                                                                                                                                                                                                                                |
| **S3 Bucket (docs)**                                         | Single shared bucket per environment; per-tenant prefix enforced in `@stynx-nyx/storage`. | StorageStack       | `infra/cdk/lib/storage-stack.ts:25-79`         | Bucket name `stynx-docs-${env}-${region without dashes}`. KMS encryption; versioned; bucket-key enabled; BLOCK_ALL public access; BUCKET_OWNER_ENFORCED ownership; SSL enforced; EventBridge enabled (hook for §24/E8 scanning). Lifecycle: IA at 30d, GLACIER_IR at 180d, DEEP_ARCHIVE at 730d, noncurrent-version expiry 90d, abort-incomplete-multipart 7d. RETAIN in prod / DESTROY+autoDelete elsewhere. **Audit-archive bucket called for in spec is not provisioned** — see §7. |
| **CloudWatch Log Group (app)**                               | ECS app stdout/stderr.                                                                | ComputeStack       | `infra/cdk/lib/compute-stack.ts:48-51`         | `/aws/ecs/stynx-${env}`; 6-month retention prod / 1-month elsewhere.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **ECS Cluster (app)**                                        | Hosts the application Fargate service.                                                | ComputeStack       | `infra/cdk/lib/compute-stack.ts:53-57`         | `stynx-${env}`; ContainerInsights enabled.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **ECR Repository (referenced)**                              | Source of the app container image.                                                    | ComputeStack       | `infra/cdk/lib/compute-stack.ts:59-63`         | Imported by name from `config.ecs.imageRepositoryName` — **CDK does not create this repository**. The consumer must provision the ECR repo out-of-band or in a sibling stack.                                                                                                                                                                                                                                                                                                          |
| **Secrets Manager: app DB password (referenced)**            | `stynx_app` runtime credential.                                                       | ComputeStack       | `infra/cdk/lib/compute-stack.ts:65-69`         | Imported from secret name `stynx/${env}/db/app`. **Not created by CDK** — must be provisioned out-of-band (the only DB secret CDK creates is the `stynx_owner` master). See §3 + §7.                                                                                                                                                                                                                                                                                                   |
| **ECS Fargate Task Definition (app)**                        | App task spec.                                                                        | ComputeStack       | `infra/cdk/lib/compute-stack.ts:71-106`        | CPU/memory from env config; container `app` exposes 3000; HEALTHCHECK on `/healthz`.                                                                                                                                                                                                                                                                                                                                                                                                   |
| **ECS Fargate Service (app)**                                | Long-running app workload behind ALB.                                                 | ComputeStack       | `infra/cdk/lib/compute-stack.ts:112-122`       | `circuitBreaker.rollback`, 100% min / 200% max healthy, `enableExecuteCommand` off in prod.                                                                                                                                                                                                                                                                                                                                                                                            |
| **App Auto Scaling (CPU + memory)**                          | Target tracking.                                                                      | ComputeStack       | `infra/cdk/lib/compute-stack.ts:124-129`       | CPU 60%, memory 70%; min/max from env config.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Application Load Balancer (regional)**                     | Public ingress to the app service.                                                    | ComputeStack       | `infra/cdk/lib/compute-stack.ts:131-135`       | Internet-facing, HTTP/2 enabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **ACM Certificate (referenced)**                             | TLS for the ALB listener.                                                             | ComputeStack       | `infra/cdk/lib/compute-stack.ts:137`           | Imported from `config.certArn`. **Not created by ComputeStack.** EdgeStack does create its own cert (`infra/cdk/lib/edge-stack.ts:29-32`).                                                                                                                                                                                                                                                                                                                                             |
| **ALB HTTPS Listener (443)**                                 | TLS terminator.                                                                       | ComputeStack       | `infra/cdk/lib/compute-stack.ts:138-159`       | `RECOMMENDED_TLS` policy; targets the app on container port 3000; healthcheck `/readyz`. Public-side `/metrics` short-circuit returns 403 (lines 161-168).                                                                                                                                                                                                                                                                                                                             |
| **ALB HTTP→HTTPS Redirect (80)**                             | Force TLS.                                                                            | ComputeStack       | `infra/cdk/lib/compute-stack.ts:170-178`       | Permanent redirect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **WAFv2 Web ACL (REGIONAL)**                                 | ALB-attached WAF.                                                                     | ComputeStack       | `infra/cdk/lib/compute-stack.ts:180-239`       | Rules: AWSManagedRulesCommonRuleSet (priority 0), AWSManagedRulesKnownBadInputsRuleSet (1), rate-based 2000 / 5min IP (2).                                                                                                                                                                                                                                                                                                                                                             |
| **WAFv2 Web ACL Association**                                | Binds the regional ACL to the ALB.                                                    | ComputeStack       | `infra/cdk/lib/compute-stack.ts:241-244`       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **AMP Workspace (Managed Prometheus)**                       | Metrics scrape target.                                                                | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:29-31`   | Alias `stynx-${env}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **AMG Workspace (Managed Grafana)**                          | Dashboards.                                                                           | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:33-39`   | AWS_SSO auth, Prometheus + CloudWatch data sources.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **SNS Topic (alarms)**                                       | Alarm fan-out.                                                                        | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:41-47`   | Email subscriptions from `config.alarmRecipients`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **CloudWatch Alarm: ALB 5xx**                                | Service-error alarm.                                                                  | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:51-59`   | TARGET_5XX_COUNT > 10 over 2×5-min periods.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **CloudWatch Alarm: ECS CPU**                                | Compute-saturation alarm.                                                             | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:61-66`   | > 85 % over 6×5-min (sustained 30 min).                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **CloudWatch Alarm: DB CPU**                                 | Postgres-saturation alarm.                                                            | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:68-74`   | > 80 % over 4 periods; missing data treated as breaching.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **CloudWatch Alarm: DB Free Storage**                        | Disk pressure.                                                                        | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:76-81`   | < 10 GiB.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **CloudWatch Alarm: DB Connections**                         | Pool saturation.                                                                      | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:83-88`   | > 200 in prod / > 80 elsewhere over 3 periods.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **CloudWatch Alarm: Redis CPU**                              | Redis-saturation alarm.                                                               | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:92-105`  | > 80 % over 3×5-min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **CloudWatch Alarm: Redis Evictions**                        | Memory-pressure alarm.                                                                | ObservabilityStack | `infra/cdk/lib/observability-stack.ts:107-120` | ≥ 1 over 5-min.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Route 53 Hosted Zone (referenced)**                        | DNS apex.                                                                             | EdgeStack          | `infra/cdk/lib/edge-stack.ts:24-27`            | Looked up from `config.hostedZoneId` / `config.hostedZoneName`. **Not created** by CDK.                                                                                                                                                                                                                                                                                                                                                                                                |
| **ACM Certificate (CloudFront)**                             | TLS for the edge distribution.                                                        | EdgeStack          | `infra/cdk/lib/edge-stack.ts:29-32`            | DNS-validated against the imported zone.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **WAFv2 Web ACL (CLOUDFRONT)**                               | Edge WAF.                                                                             | EdgeStack          | `infra/cdk/lib/edge-stack.ts:34-109`           | CommonRuleSet, KnownBadInputs, IP reputation, rate-based 2000 / 5min IP. Distinct ACL from the regional one on the ALB.                                                                                                                                                                                                                                                                                                                                                                |
| **CloudFront Distribution**                                  | Edge ingress.                                                                         | EdgeStack          | `infra/cdk/lib/edge-stack.ts:111-133`          | TLS_V1_2_2021 minimum; HTTP/2+3; ALL methods, GET/HEAD/OPTIONS cached, `CACHING_DISABLED` policy, `ALL_VIEWER_EXCEPT_HOST_HEADER` origin-request policy; price class ALL in prod / 100 elsewhere.                                                                                                                                                                                                                                                                                      |
| **Route 53 Alias A + AAAA**                                  | Apex points at CloudFront.                                                            | EdgeStack          | `infra/cdk/lib/edge-stack.ts:135-145`          | `config.domain` → distribution.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Service families implied but not provisioned:**

- **IAM roles (task / execution / deploy)** — described in CDK skeleton
  spec §9. The actual code grants are limited to
  `docsBucket.grantReadWrite`, `kmsDocsKey.grantEncryptDecrypt`, and
  `dbSecret.grantRead` on the task role (`compute-stack.ts:108-110`).
  Cognito admin grants and the CI deploy role (GitHub OIDC) are **not
  in code** — provisioning them is a porting prerequisite.
- **DB bootstrap job** to create `stynx_app` and `stynx_reader` roles
  (skeleton §9). Not present in CDK; the reference-api currently uses
  `stynx_owner` for all three connection strings (see compose file
  `STYNX_*_DATABASE_URL` values, all identical).

---

## 2. Local-dev services (docker-compose)

Source: `reference/api/docker-compose.yml`. Five services run
locally; the table below captures each, mapped to the production
counterpart.

| Compose service | Image                                 | Port(s) | Production analogue                    | Notes                                                                                                                                                                                         |
| --------------- | ------------------------------------- | ------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres`      | `postgres:16-alpine`                  | 5432    | RDS PostgreSQL 16.3 (DataStack)        | DB/user/password all `postgres`; healthcheck via `pg_isready`. The reference-api boots in single-role mode against this — owner/app/reader URLs all point here.                               |
| `redis`         | `redis:7-alpine`                      | 6379    | ElastiCache Redis 7.1 (DataStack)      | No password, no TLS. Production uses `rediss://` (TLS) and a primary endpoint from the replication group.                                                                                     |
| `localstack`    | `localstack/localstack:3.8.1`         | 4566    | S3 + KMS in production                 | `SERVICES=s3` only — KMS, Secrets Manager, Cognito-IDP are not emulated by this LocalStack instance. Init script `localstack/init-s3.sh` creates the dev bucket `stynx-docs-local-us-east-1`. |
| `cognito-local` | `jagregory/cognito-local:latest`      | 9229    | Cognito User Pool (IdentityStack)      | Pre-seeded pool `local_testing_pool` and client `local_testing_client`. Issuer URL `http://cognito-local:9229`.                                                                               |
| `reference-api` | built from `reference/api/Dockerfile` | 3000    | ECS Fargate app service (ComputeStack) | Depends on all four backing services (`condition: service_healthy`).                                                                                                                          |

**Services expected by production but absent locally:**

- **PgBouncer.** Production routes the app through PgBouncer
  (`data-stack.ts:78-113`). Local dev bypasses the pooler — the app
  connects directly to Postgres on 5432.
- **KMS.** LocalStack is configured with `SERVICES: s3` only; the
  storage module is told to use endpoint `http://localstack:4566`
  (`STYNX_STORAGE_ENDPOINT`) and `force-path-style`, but encryption
  with a real CMK is not exercised. `STYNX_KMS_ALIAS` defaults to
  `stynx-local`.
- **Secrets Manager.** Not emulated. The reference-api takes DB
  passwords inline via the connection-string env vars and synthesizes
  a session-signing keypair at boot if `STYNX_SESSION_KEY_SET_JSON` is
  unset (`reference/api/src/app.module.ts:29-49`).
- **WAF / ALB / CloudFront.** No edge or load-balancer emulation —
  the app exposes 3000 directly.
- **Observability stack.** No AMP, AMG, SNS, or CloudWatch emulation.
  Logs go to stdout via `@stynx-nyx/logging` (Pino).

**reference-web** has its own Dockerfile (`reference/web/Dockerfile`)
serving the SPA on port 3100 (`PORT=3100`) via
`scripts/serve-static.mjs`. It is **not** part of the compose file —
it is a separately built image whose origin in production is fronted
by the same ALB/CloudFront pair (or a dedicated static-asset origin,
not modelled in the current CDK).

---

## 3. Environment variables every consuming app needs

There is **no `.env.example`** in `reference/api/` (audit
FIND: `_DISCOVERY.md` §11 item 3). The table below was built by
grepping `process.env.X` and the local `env('X', fallback)` helper
across `reference/api/src/` and `packages/*/src/`. Every name is
verified — none invented.

| Variable                                                                                                             | Required                                 | Default (if any)                                         | Source                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                                           | recommended                              | n/a                                                      | `process.env.NODE_ENV` — Pino log-level resolution and standard Node conventions; injected by `compute-stack.ts:84`.                                                                                                            |
| `AWS_REGION`                                                                                                         | yes (prod)                               | n/a                                                      | Injected by `compute-stack.ts:85`; consumed by `packages/auth/src/cognito-admin.adapter.ts:452`.                                                                                                                                |
| `AWS_DEFAULT_REGION`                                                                                                 | optional                                 | n/a                                                      | Fallback to `AWS_REGION` in `cognito-admin.adapter.ts:453`.                                                                                                                                                                     |
| `AWS_PROFILE`                                                                                                        | dev only                                 | n/a                                                      | `cognito-admin.adapter.ts:424,480,482` and `packages/auth/src/cognito-admin.adapter.ts:429`.                                                                                                                                    |
| `PORT`                                                                                                               | optional                                 | `3000`                                                   | `reference/api/src/main.ts:30` (`Number(process.env.PORT ?? '3000')`).                                                                                                                                                          |
| `LOG_LEVEL`                                                                                                          | optional                                 | `info`                                                   | `packages/logging/src/pino.factory.ts:30`.                                                                                                                                                                                      |
| `STYNX_ENV`                                                                                                          | optional                                 | n/a                                                      | Injected by `compute-stack.ts:86`. (Read indirectly by tooling; not consumed by core packages today.)                                                                                                                           |
| `STYNX_ENVIRONMENT`                                                                                                  | optional                                 | `local`                                                  | `app.module.ts:215` — passed to `StynxStorageModule.forRoot({ environment })`.                                                                                                                                                  |
| `STYNX_OWNER_DATABASE_URL`                                                                                           | yes                                      | `postgresql://postgres:postgres@localhost:5432/postgres` | `app.module.ts:171` — owner pool.                                                                                                                                                                                               |
| `STYNX_APP_DATABASE_URL`                                                                                             | yes                                      | same default                                             | `app.module.ts:172` — app pool.                                                                                                                                                                                                 |
| `STYNX_READER_DATABASE_URL`                                                                                          | yes                                      | same default                                             | `app.module.ts:173` — reader pool.                                                                                                                                                                                              |
| `STYNX_REDIS_URL`                                                                                                    | yes (prod)                               | `redis://127.0.0.1:6379` (sessions only)                 | `app.module.ts:188-194,199,236-241,246-252` and `process.env.STYNX_REDIS_URL`. Used by `@stynx-nyx/auth`, `@stynx-nyx/sessions`, rate-limit, idempotency.                                                                               |
| `STYNX_STYNX_ISSUER`                                                                                                 | yes                                      | `https://stynx.local`                                    | `app.module.ts:182,197` — issuer for STYNX-issued session tokens.                                                                                                                                                               |
| `STYNX_COGNITO_ISSUER`                                                                                               | yes                                      | `https://cognito.local`                                  | `app.module.ts:185` — issuer URL of the Cognito User Pool.                                                                                                                                                                      |
| `STYNX_COGNITO_JWKS_URI`                                                                                             | optional (derived from issuer if absent) | n/a                                                      | `app.module.ts:186`.                                                                                                                                                                                                            |
| `STYNX_SESSION_KEY_SET_JSON`                                                                                         | yes (prod)                               | dev fallback generates an in-memory RSA keypair at boot  | `app.module.ts:44-48`. JSON-serialized `{ currentKid, keys: [{ kid, publicKeyPem, privateKeyPem }] }`.                                                                                                                          |
| `STYNX_STORAGE_REGION`                                                                                               | optional                                 | `us-east-1`                                              | `app.module.ts:216`.                                                                                                                                                                                                            |
| `STYNX_STORAGE_BUCKET`                                                                                               | yes                                      | derived `stynx-docs-${env}-${region}`                    | `app.module.ts:218-221`.                                                                                                                                                                                                        |
| `STYNX_STORAGE_ENDPOINT`                                                                                             | dev only                                 | n/a                                                      | `app.module.ts:229` (LocalStack endpoint override).                                                                                                                                                                             |
| `STYNX_STORAGE_FORCE_PATH_STYLE`                                                                                     | dev only                                 | n/a                                                      | `app.module.ts:230` (`'true'` enables path-style for LocalStack).                                                                                                                                                               |
| `STYNX_KMS_ALIAS`                                                                                                    | yes (prod)                               | `stynx-local`                                            | `app.module.ts:217`.                                                                                                                                                                                                            |
| `STYNX_TENANCY_PLATFORM_ADMIN`                                                                                       | dev/test only                            | n/a                                                      | `packages/tenancy/src/tenancy-platform-admin.guard.ts:6`; also referenced as the platform-admin env flag in `packages/tenancy/src/types.ts:97`. Bypasses platform-admin guard when `'true'`. **Must NOT be set in production.** |
| `STYNX_REFERENCE_WEB_ORIGINS`                                                                                        | reference-api only                       | `http://127.0.0.1:3100,http://localhost:3100`            | `reference/api/src/main.ts:7` — CORS allow-list for the SPA.                                                                                                                                                                    |
| `STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY`                                                                          | optional                                 | derived from `AWS_PROFILE` presence                      | `packages/auth/src/cognito-admin.adapter.ts:479`. Values: `default-chain` \| `profile`.                                                                                                                                         |
| `STYNX_IDENTITY_ADMIN_AWS_PROFILE`                                                                                   | optional                                 | falls back to `AWS_PROFILE`                              | `cognito-admin.adapter.ts:482`.                                                                                                                                                                                                 |
| `COGNITO_REGION`                                                                                                     | optional                                 | falls back to `AWS_REGION` / `AWS_DEFAULT_REGION`        | `cognito-admin.adapter.ts:451`.                                                                                                                                                                                                 |
| `COGNITO_USER_POOL_ID`                                                                                               | yes (admin operations)                   | n/a                                                      | `cognito-admin.adapter.ts:457`. Injected by `compute-stack.ts:89`.                                                                                                                                                              |
| `COGNITO_POOL_ID`                                                                                                    | optional                                 | falls back from `COGNITO_USER_POOL_ID`                   | `cognito-admin.adapter.ts:458`.                                                                                                                                                                                                 |
| `COGNITO_CLIENT_ID`                                                                                                  | yes (SPA wiring)                         | n/a                                                      | Injected by `compute-stack.ts:90`. (Consumed by the SPA / SDK; the API uses the issuer + JWKS to validate tokens.)                                                                                                              |
| `COGNITO_IDP_ENDPOINT`                                                                                               | dev only                                 | n/a                                                      | `cognito-admin.adapter.ts:460` — override for LocalStack/cognito-local endpoints.                                                                                                                                               |
| `PGBOUNCER_HOST`                                                                                                     | yes (prod)                               | n/a                                                      | Injected by `compute-stack.ts:87` from `data.pgBouncerEndpoint`.                                                                                                                                                                |
| `DOCS_BUCKET`                                                                                                        | yes (prod)                               | n/a                                                      | Injected by `compute-stack.ts:91`. (Currently the app reads `STYNX_STORAGE_BUCKET` — porting agents must reconcile: prefer `STYNX_STORAGE_BUCKET` and either drop `DOCS_BUCKET` or alias them. See §7 drift.)                   |
| `KMS_DOCS_KEY_ID`                                                                                                    | yes (prod)                               | n/a                                                      | Injected by `compute-stack.ts:92`.                                                                                                                                                                                              |
| `DB_APP_PASSWORD`                                                                                                    | yes (prod)                               | n/a                                                      | Injected via `EcsSecret.fromSecretsManager` (`compute-stack.ts:95`). The app must build its connection string from it (currently expected to live inside `STYNX_APP_DATABASE_URL`, so wiring code is needed).                   |
| `DB_OWNER_PASSWORD`                                                                                                  | yes (prod)                               | n/a                                                      | Injected via `EcsSecret.fromSecretsManager` (`compute-stack.ts:96`). Same caveat as above.                                                                                                                                      |
| `STYNX_SAMPLE_RECORD_CREATE_LIMIT`                                                                                   | sample app only                          | n/a                                                      | `reference/api/docker-compose.yml:79`.                                                                                                                                                                                          |
| `STYNX_SAMPLE_RECORD_CREATE_WINDOW_SECONDS`                                                                          | sample app only                          | n/a                                                      | compose:80.                                                                                                                                                                                                                     |
| `STYNX_SAMPLE_RECORD_READ_LIMIT`                                                                                     | sample app only                          | n/a                                                      | compose:81.                                                                                                                                                                                                                     |
| `STYNX_SAMPLE_RECORD_READ_WINDOW_SECONDS`                                                                            | sample app only                          | n/a                                                      | compose:82.                                                                                                                                                                                                                     |
| `STYNX_SAMPLE_RECORD_DELETE_LIMIT`                                                                                   | sample app only                          | n/a                                                      | compose:83.                                                                                                                                                                                                                     |
| `STYNX_SAMPLE_RECORD_DELETE_WINDOW_SECONDS`                                                                          | sample app only                          | n/a                                                      | compose:84.                                                                                                                                                                                                                     |
| `STYNX_SAMPLE_RECORD_NOTE_CREATE_LIMIT`                                                                              | sample app only                          | n/a                                                      | compose:85.                                                                                                                                                                                                                     |
| `STYNX_SAMPLE_RECORD_NOTE_CREATE_WINDOW_SECONDS`                                                                     | sample app only                          | n/a                                                      | compose:86.                                                                                                                                                                                                                     |
| `STYNX_SAMPLE_DOCUMENT_WRITE_LIMIT`                                                                                  | sample app only                          | n/a                                                      | compose:87.                                                                                                                                                                                                                     |
| `STYNX_SAMPLE_DOCUMENT_WRITE_WINDOW_SECONDS`                                                                         | sample app only                          | n/a                                                      | compose:88.                                                                                                                                                                                                                     |
| `AWS_ACCESS_KEY_ID`                                                                                                  | dev only                                 | `test` (compose)                                         | compose:89; LocalStack dummy creds. **Never set in production** — the task role provides credentials.                                                                                                                           |
| `AWS_SECRET_ACCESS_KEY`                                                                                              | dev only                                 | `test` (compose)                                         | compose:90. Same caveat.                                                                                                                                                                                                        |
| `HUSKY`                                                                                                              | build only                               | `0` (Dockerfile)                                         | `reference/api/Dockerfile:8` — disables hook installation in CI/image builds.                                                                                                                                                   |
| `CI`                                                                                                                 | build only                               | `true` (Dockerfile)                                      | `reference/api/Dockerfile:7`.                                                                                                                                                                                                   |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD`                                                                | dev only                                 | compose values                                           | compose:5-7 — Postgres image bootstrap.                                                                                                                                                                                         |
| `POSTGRESQL_HOST` / `POSTGRESQL_PORT_NUMBER` / `POSTGRESQL_USERNAME` / `POSTGRESQL_PASSWORD` / `PGBOUNCER_POOL_MODE` | infra-only (PgBouncer container)         | derived from RDS endpoint + `stynx_owner` secret         | `infra/cdk/lib/data-stack.ts:90-98` — consumed by the Bitnami PgBouncer image, not by the app.                                                                                                                                  |

**Compose-file env keys without code references** (likely future
expansion or already resolved upstream of the grep):

- `SERVICES`, `AWS_DEFAULT_REGION` (under `localstack`).
- `COGNITO_LOCAL_PORT`, `COGNITO_LOCAL_USER_POOLS` (under
  `cognito-local`).

These are consumed by the third-party container images, not by STYNX
code.

**Inventory caveats:**

1. The app reads connection strings, not username+password pairs. The
   `DB_APP_PASSWORD` / `DB_OWNER_PASSWORD` injections in
   `compute-stack.ts:95-96` are not yet consumed by any TypeScript in
   the repo — porting agents must either build the URL at task-start
   from a sidecar/init script or change the CDK to inject the full
   URLs.
2. `STYNX_TENANCY_PLATFORM_ADMIN` is a developer-bypass flag; never
   plumb through CDK env injection.
3. `LOG_LEVEL`, `NODE_ENV`, `AWS_*` follow standard conventions —
   not a STYNX invention but listed here because consumers need them
   set.

---

## 4. Secrets that need provisioning

Of the secrets below, **only the DB master is created by CDK today**.
Porting agents must provision the rest out-of-band (or extend the
stack with a thin construct that does).

- **DB master password (`stynx_owner`).**
  - Created by CDK at `infra/cdk/lib/data-stack.ts:33-41`, name
    `stynx/${env}/db/master`, 40 chars, no punctuation.
  - **Rotation is not configured in code.** The CDK skeleton spec
    (§5) calls for monthly hosted rotation
    (`addRotationSchedule({ automaticallyAfter: Duration.days(30) })`)
    — drift, see §7.
- **App DB user passwords (`stynx_app`, `stynx_reader`).**
  - Referenced in `compute-stack.ts:65-69` at name
    `stynx/${env}/db/app` — but **not created** by CDK. The reference
    secret reads only the `password` field, so a single secret per
    role is sufficient; consumers must:
    1. Create the SecretsManager secrets for `stynx_app` and
       `stynx_reader`.
    2. Rotate them, ideally via `PostgreSQLMultiUser` rotation tied to
       the master.
    3. Ensure the role-creation bootstrap job (skeleton §9) has
       inserted matching users into Postgres before the app starts.
  - The reader role is **not yet wired** in CDK — there is no
    `stynx/${env}/db/reader` import. Porting agents using `@ReadOnly()`
    routes must add this themselves.
- **Cognito Admin app-client secret.**
  - The `AdminClient` is created with `generateSecret: true`
    (`identity-stack.ts:66-72`). The secret value lands in the
    Cognito service itself; it is **not** auto-mirrored into Secrets
    Manager. Consumers must `aws cognito-idp describe-user-pool-client`
    and copy the secret into a SecretsManager entry the app role can
    read.
- **KMS key ARNs.**
  - `kmsDocsKey` (storage) is created at
    `storage-stack.ts:16-23`. Its alias `alias/stynx-docs-${env}` and
    keyId are passed via `KMS_DOCS_KEY_ID` to the app
    (`compute-stack.ts:92`) and the bucket is bound directly. No
    extra provisioning needed except IAM grants beyond what CDK already
    wires (`compute-stack.ts:109`).
  - **No audit-archive KMS key**, **no log-encryption KMS key**, and
    **no Cognito custom KMS key** are provisioned. Audit log retention
    & WORM are out-of-scope for this skeleton — see §6.
- **STYNX session signing keypair (RS256).**
  - Loaded from `STYNX_SESSION_KEY_SET_JSON`
    (`reference/api/src/app.module.ts:43-49`). Spec calls for
    quarterly rotation (SPEC §18.2). Today rotation is **manual** —
    consumers must provision a Secrets Manager entry holding the
    JSON-serialized keyset and a rotator (Lambda or scheduled job)
    that emits a new `currentKid` while keeping the previous public
    key in `keys[]` for verification of in-flight tokens.
  - The dev-mode boot path generates an ephemeral RSA-2048 keypair
    in-process — fine for dev, loses every restart, must not be used
    in prod.
- **DB role-creation bootstrap.** Not a secret per se, but a one-shot
  job that connects as `stynx_owner` and provisions
  `stynx_app` / `stynx_reader` (with the just-created passwords) is
  required before the platform migrations run. The reference-api
  short-circuits this by pointing all three URLs at the same
  superuser locally — a porting agent cannot.

---

## 5. Network requirements

Source: `infra/cdk/lib/network-stack.ts`. The repo's network shape is
the spec's three-tier VPC with the following concrete bindings:

- **CIDR / AZ count** come from the env config
  (`config.vpc.cidr`, `config.vpc.maxAzs`,
  `network-stack.ts:14-23`). Skeleton example uses `10.20.0.0/16` and
  `maxAzs: 3` for prod.
- **Subnet tiers (`network-stack.ts:18-22`):**
  - `public` — `SubnetType.PUBLIC`, `cidrMask: 24`. Only the ALB and
    NAT gateways live here.
  - `app` — `SubnetType.PRIVATE_WITH_EGRESS`, `cidrMask: 22`. Hosts
    the app Fargate service (`compute-stack.ts:116`) and the
    PgBouncer Fargate service (`data-stack.ts:108-110`).
  - `data` — `SubnetType.PRIVATE_ISOLATED`, `cidrMask: 24`. Hosts
    RDS (`data-stack.ts:50-52`) and the Redis subnet group
    (`data-stack.ts:117-121`). No default route to the internet.
- **NAT gateways (`network-stack.ts:17`).** `prod ? maxAzs : 1` —
  per-AZ in prod for resilience, single NAT in lower envs for cost.
- **Gateway endpoint (`network-stack.ts:25-27`).** S3 only. The
  skeleton sketch also includes DynamoDB; STYNX does not use DynamoDB,
  so it's omitted in code.
- **Interface endpoints (`network-stack.ts:29-40`).**
  SECRETS_MANAGER, KMS, CLOUDWATCH_LOGS, ECR, ECR_DOCKER. PrivateDNS
  enabled. **Cognito-IDP is not in this list** — admin calls from
  the app to Cognito traverse NAT. Porting agents who want a fully
  private path should add `InterfaceVpcEndpointAwsService.COGNITO_IDP`.
- **VPC Flow Logs (`network-stack.ts:42-50`).** All-traffic logs to a
  CloudWatch Log Group with one-month retention. Removal is RETAIN in
  prod / DESTROY otherwise.
- **Security groups.**
  - `DbSg` (RDS, `data-stack.ts:28-31`): allows ingress from PgBouncer
    on 5432 (`data-stack.ts:75-76`).
  - `PgBouncerSg` (`data-stack.ts:70-74`): `allowAllOutbound: false`;
    egress is opened explicitly to `DbSg` on 5432.
  - `RedisSg` (`data-stack.ts:132-135`): no explicit ingress rules in
    code — default behavior is no inbound. **Porting agents must
    open Redis 6379 from the app SG**, otherwise the Fargate service
    cannot reach Redis. This is a known omission.
  - The app service runs in the `PRIVATE_WITH_EGRESS` tier with
    CDK-default SG (`compute-stack.ts:112-122`). The ALB target binding
    auto-generates the ingress rule from ALB SG → app SG.

---

## 6. Out of scope

Explicitly **not** modelled in `infra/cdk/lib/`:

- **Disaster recovery.** No cross-region replication, no AWS Backup
  vault, no read-replica wiring. RDS retains snapshots per
  `config.db.backupRetentionDays`, but multi-region failover and
  point-in-time-recovery automation across accounts are out of scope.
- **Cross-region replication.** Neither the docs bucket nor RDS has
  CRR configured.
- **Backup retention beyond defaults.** S3 lifecycle expires
  noncurrent versions at 90 days; RDS snapshots retained per env
  config; no longer-term audit-archive bucket exists in code (the
  spec mentions "Audit archive bucket — separate, longer retention,
  deep-archive heavy — elided" at `STYNX-CDK-SKELETON.md:528-529`).
- **Ad-hoc analytics.** No Athena, Redshift, Glue, or QuickSight.
  Audit-trail egress for analytics is a porting concern but not a
  STYNX-platform feature.
- **GuardDuty / Security Hub / AWS Config.** Account-baseline
  controls, expected to live in a landing zone (skeleton §10).
- **Route 53 hosted-zone creation.** Imported in EdgeStack
  (`edge-stack.ts:24-27`) — provisioned upstream.
- **Static-asset origin.** `reference/web` builds a separate
  image but no CDN origin / S3-static-hosting is in CDK; consumers
  using the SPA must provision either an additional CloudFront
  behavior or a separate static origin.

**Live porting concern — audit FIND-031 (operations runbooks
absent).** `_DISCOVERY.md` §0 marks FIND-031 as "still likely live"
at the discovery commit. Consumers porting to a regulated environment
must own runbooks for at least: KMS key rotation, RDS engine upgrade,
session-keypair rotation, app-DB password rotation, Redis failover,
Cognito user-pool migration, and S3 lifecycle audit. None of these
exist in `docs/meta/ops/` at HEAD.

---

## 7. CDK skeleton vs current code

Comparison driver: `specs/STYNX-CDK-SKELETON.md` (lines as cited).
Drift items below are confirmed by reading the current
`infra/cdk/lib/*.ts` files.

### 7.1 Stack count and ordering

- **Spec §1** describes six stacks. **Code** has seven —
  `EdgeStack` was added (per `_DISCOVERY.md` §0 closing FIND-005).
  No drift; this is a forward-extension.
- **Stack order.** Spec order (Network → Identity → Data → Storage →
  Compute → Observability) is preserved. The Edge stack runs after
  Compute (it consumes `compute.alb`).

### 7.2 NetworkStack drift

- Spec uses `ipAddresses: { cidrBlock: ... } as any`
  (`STYNX-CDK-SKELETON.md:175`). Code uses the supported
  `ec2.IpAddresses.cidr(...)` (`network-stack.ts:15`). **Improvement
  vs spec, no functional drift.**
- Interface-endpoint set matches exactly (Secrets Manager, KMS,
  CloudWatch Logs, ECR, ECR Docker).
- Flow-log destination, retention, and removal policy match.

### 7.3 IdentityStack drift

- Spec uses `AdvancedSecurityMode.ENFORCED` /
  `AUDIT` (`STYNX-CDK-SKELETON.md:253-255`). Code uses
  `StandardThreatProtectionMode.FULL_FUNCTION` /
  `AUDIT_ONLY` (`identity-stack.ts:30-32`) — this is the **renamed
  CDK API**, no functional drift.
- Spec includes a SAML federation comment placeholder
  (`STYNX-CDK-SKELETON.md:287-289`). Code has no SAML wiring at all
  — drift, low-severity (the spec marks it as a placeholder).

### 7.4 DataStack drift

- **Postgres instance class** is hard-coded
  (`InstanceClass.T4G, InstanceSize.MEDIUM`) at
  `data-stack.ts:47`. The spec parameterizes it via
  `config.db.instanceClass` (`STYNX-CDK-SKELETON.md:349`). **Drift,
  medium severity** — prod sizing cannot be tuned via env config.
- **Engine version** is pinned to `VER_16_3`
  (`data-stack.ts:45`). Spec uses `PostgresEngineVersion.of(config.db.pgVersion, '16')`.
  **Drift, low severity** — config has a `pgVersion` field that's
  ignored.
- **Custom DB parameters** (`log_min_duration_statement`,
  `log_connections`, `pg_stat_statements`, `row_security = on`) are
  in the spec (`STYNX-CDK-SKELETON.md:363-371`) but **not in code**.
  **Drift, medium severity** — slow-query log threshold and
  `pg_stat_statements` are observability prerequisites.
- **Performance Insights retention** (731 / 7 days) is in spec
  (line 361), absent in code. **Drift, low.**
- **DB master rotation** — spec §5 schedules monthly rotation
  (`STYNX-CDK-SKELETON.md:376-379`). Code has none. **Drift, high
  severity** — see §4.
- **PgBouncer endpoint resolution.** Spec §5 acknowledges Cloud Map
  / NLB and elides; code hard-codes
  `pgbouncer.${env}.stynx.internal:5432` as a string literal
  (`data-stack.ts:115`). **Drift, high severity** — DNS for that name
  must be provisioned out-of-band (e.g., in a Cloud Map service or a
  Route 53 private zone) or the app cannot resolve PgBouncer.
- **Redis SG ingress** is unset (see §5). **Drift, blocker for
  prod**.

### 7.5 StorageStack drift

- Lifecycle rules match exactly (IA 30d, GLACIER_IR 180d,
  DEEP_ARCHIVE 730d, noncurrent 90d, abort-MPU 7d).
- KMS key + bucket + EventBridge + ownership controls match.
- **Audit archive bucket is absent** vs the spec's elision comment
  at line 528. **Drift, medium** — audit log retention beyond RDS
  backups is undefined.

### 7.6 ComputeStack drift

- Healthcheck path on the ALB uses `/readyz`
  (`compute-stack.ts:155`); container-level health uses `/healthz`
  (`compute-stack.ts:100`). Matches spec.
- **Secrets injection mismatch.** Spec injects
  `DB_APP_PASSWORD` only (line 604-607). Code injects both
  `DB_APP_PASSWORD` and `DB_OWNER_PASSWORD`
  (`compute-stack.ts:95-96`). The owner password injection into the
  app task **is a privilege concern** — runtime app code should not
  hold the owner credential. **Drift, medium-to-high severity** —
  porting agents should drop `DB_OWNER_PASSWORD` from the app task and
  move bootstrap-time owner usage into a separate one-shot task.
- **Env `DOCS_BUCKET` vs code's `STYNX_STORAGE_BUCKET`.** CDK
  injects `DOCS_BUCKET` (line 91) but the app reads
  `STYNX_STORAGE_BUCKET` (`app.module.ts:218-221`). **Drift, blocker
  for prod** — the app will use the default-derived bucket name
  unless the consumer either renames the env var or sets
  `STYNX_STORAGE_BUCKET` explicitly. Same applies to
  `KMS_DOCS_KEY_ID` vs `STYNX_KMS_ALIAS`.
- **Internal `/metrics` listener**: spec describes a separate private
  ALB listener (`STYNX-CDK-SKELETON.md:670-671`); code only adds the
  public-side 403 short-circuit (`compute-stack.ts:161-168`). **Drift,
  blocker for AMP scrape** — there is no path for the AMP scraper to
  reach `/metrics`. Porting agents must add an internal NLB or
  private ALB listener.
- **TLS policy.** Spec specifies
  `ELBSecurityPolicy-TLS13-1-2-2021-06`. Code uses
  `elbv2.SslPolicy.RECOMMENDED_TLS` — equivalent today, drift-free
  in spirit.
- **Task-role grants.** Spec §9 enumerates Cognito admin and
  Secrets Manager grants. Code grants only docs bucket + KMS +
  master-secret read (`compute-stack.ts:108-110`). **Drift, medium
  severity.** A consumer that drives the Cognito admin client from
  the app role will get AccessDenied without policy additions.

### 7.7 ObservabilityStack drift

- AMP + AMG provisioned as spec describes.
- Alarm set: spec §8 shows ALB-5xx, ECS CPU, DB CPU, DB free
  storage, DB connections + "Redis CPU/memory/evictions and audit-lag
  alarms elided for space". Code adds Redis CPU and Redis Evictions
  (`observability-stack.ts:92-120`) but **omits Redis memory and
  audit-lag alarms**. **Drift, low severity** — eviction-count is a
  reasonable proxy for memory pressure.
- **Grafana dashboards provisioner** referenced in spec §8 is not in
  code; AMG comes up empty.

### 7.8 EdgeStack drift

EdgeStack does not exist in the CDK skeleton spec — it is a
forward-extension (closing audit FIND-005). Compared against
skeleton §10 ("CloudFront in front of the ALB. Recommended for prod
…") it implements that recommendation. No drift; net-positive
addition.

### 7.9 Summary of drift severity

| Drift                                                                                                                               | Severity              | Where                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| DB master rotation absent                                                                                                           | high                  | `data-stack.ts:33-41`                                    |
| PgBouncer endpoint hard-coded; no Cloud Map / private DNS                                                                           | high                  | `data-stack.ts:115`                                      |
| Redis SG has no ingress                                                                                                             | blocker               | `data-stack.ts:132-135`                                  |
| `DOCS_BUCKET` / `KMS_DOCS_KEY_ID` env names not aligned with `@stynx-nyx/storage` consumer (`STYNX_STORAGE_BUCKET` / `STYNX_KMS_ALIAS`) | blocker               | `compute-stack.ts:91-92` vs `app.module.ts:217-220`      |
| App task carries `DB_OWNER_PASSWORD`                                                                                                | high                  | `compute-stack.ts:96`                                    |
| No internal `/metrics` listener for AMP scrape                                                                                      | high                  | `compute-stack.ts:161-168`                               |
| DB instance class / engine version not parameterized                                                                                | medium                | `data-stack.ts:45-47`                                    |
| Custom Postgres parameters (slow-log, pg_stat_statements, row_security) absent                                                      | medium                | `data-stack.ts:43-63`                                    |
| Task role missing Cognito admin & app-secret reads                                                                                  | medium                | `compute-stack.ts:108-110`                               |
| `stynx_app` / `stynx_reader` secrets not created by CDK                                                                             | medium                | (absent)                                                 |
| `STYNX_TENANCY_PLATFORM_ADMIN` accidental inclusion risk                                                                            | low (porting hygiene) | `packages/tenancy/src/tenancy-platform-admin.guard.ts:6` |
| Audit-archive bucket absent                                                                                                         | medium                | (absent)                                                 |
| AMG dashboards provisioner absent                                                                                                   | low                   | (absent)                                                 |
| Cognito-IDP VPC interface endpoint absent                                                                                           | low                   | `network-stack.ts:29-40`                                 |
| SAML federation placeholder absent                                                                                                  | low                   | (absent)                                                 |

---

## 8. What a consumer must own end-to-end

Pulling §1–§7 together — the porting agent's checklist:

1. **AWS account + landing zone** with GuardDuty / Config /
   SecurityHub baselined out-of-band. CDK does not do this.
2. **Route 53 hosted zone** for the API domain, plus the `hostedZoneId`
   / `hostedZoneName` / `domain` / `certArn` values in
   `infra/cdk/config/{env}.ts`.
3. **ECR repository** named per `config.ecs.imageRepositoryName` —
   not provisioned by CDK (`compute-stack.ts:59-63`).
4. **Two Secrets Manager entries** (`stynx/${env}/db/app`,
   `stynx/${env}/db/reader`) with `password` field — created
   out-of-band, then read by the app task.
5. **DB role-bootstrap one-shot** (creates `stynx_app` and
   `stynx_reader` in Postgres using `stynx_owner` and the SecretsManager
   passwords). Run once after the first `cdk deploy` of the data
   stack.
6. **Session keypair secret** holding `STYNX_SESSION_KEY_SET_JSON`,
   plus a quarterly rotator.
7. **PgBouncer DNS record** at `pgbouncer.${env}.stynx.internal` — or
   refactor `data-stack.ts:115` to wire a real Cloud Map / NLB.
8. **Internal ALB listener for `/metrics`** so AMP can scrape, or
   replace AMP scrape with an OTel Collector sidecar that pushes via
   remote-write.
9. **Redis SG ingress rule** opening 6379 from the app SG.
10. **Operations runbooks** per §6 (FIND-031 closure).
11. **Observability dashboards** under
    `infra/cdk/dashboards/` and an AMG provisioner.
12. **CI deploy role** federated via GitHub OIDC, scoped to the stack
    family. No long-lived AWS keys.

---

## 9. Cross-references

- `_DISCOVERY.md` §0 — audit drift table (FIND-005, FIND-031).
- `_DISCOVERY.md` §11 — open questions, including the missing
  `.env.example` that motivated §3.
- `04-INVARIANTS-AND-CONTRACTS.md` — invariants I1 (no raw DB), I3
  (no direct S3) constrain how secrets and endpoints flow.
- `05-PACKAGE-CATALOG.md` — package list whose runtime needs surface
  the env vars in §3.
- `specs/STYNX-CDK-SKELETON.md` — normative reference compared in §7.
- `specs/STYNX-SPEC-v0.6.md` §11 (observability), §13.1 (PgBouncer
  pool sizing), §15.3 (WAF rate-limit), §17/§18 (configuration +
  rotation).

---

_End of infrastructure requirements._
