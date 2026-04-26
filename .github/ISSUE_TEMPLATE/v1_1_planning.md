---
name: v1.1 planning
about: Seed the next delivery wave from the deferred extensions list in SPEC §24.
title: 'v1.1 planning'
labels:
  - planning
  - v1.1
assignees: []
---

## Deferred extensions from `SPEC §24`

- [ ] E1 `Feature flags`
  Per-tenant + per-user flags with Redis pub/sub invalidation.
- [ ] E2 `Background jobs`
  BullMQ jobs carrying `TenantContext` + `ActorContext`.
- [ ] E3 `Outbox + EventBridge`
  Transactional outbox with per-(tenant, aggregate) ordering.
- [ ] E4 `M2M API keys`
  Service identities and scoped credentials.
- [ ] E5 `Webhook delivery`
  Signed retrying outbound webhook subsystem.
- [ ] E6 `ABAC and relationship authz`
  Beyond v1.0 RBAC.
- [ ] E7 `Tenant self-service signup`
  Public onboarding and tenant creation flow.
- [ ] E8 `Document virus scanning`
  GuardDuty Malware Protection for S3 with ClamAV-in-Lambda fallback.

## Release carry-overs

- [ ] Review any unresolved Prompt 31/34/35/36 release blockers.
- [ ] Reassess package release policy, security scans, and container signing posture after `1.0.0`.
- [ ] Identify which compatibility `@stech/*` packages should remain supported beyond `1.0.x`.
