# Architecture

**Authority:** Architect (Constitution Article 6).

This directory is the canonical engineering-specification substrate for stynx.
It explains the framework invariants, runtime topology, reference applications,
infrastructure, and package documentation expectations that Engineers and
Inspectors actuate against.

## Entry Points

- [STYNX Spec v0.6](STYNX-SPEC-v0.6.md) — broad platform architecture and
  package intent.
- [Developer Documentation Standard](developer-documentation.md) — package
  README, TypeDoc, and TSDoc expectations for exported APIs.
- [STYNX API Data](STYNX-API-DATA.md) — data/API persistence model.
- [STYNX CDK Skeleton](STYNX-CDK-SKELETON.md) — AWS infrastructure reference.
- [Flow Architecture](flow.md) — tenant-scoped workflow design/runtime model.
- [Reference App Data/RBAC](reference-app-data-rbac.md) — reference data model,
  permissions, and route-binding evidence.

## Invariants And Trace

- [invariants/](invariants/) contains active stynx invariants such as
  `INV-RBAC-001`, `INV-PRIVACY-001`, `INV-PACKAGES-001`, and Flow invariants.
- `trace.json` maps invariant anchors to code and sensor surfaces.

## Related Substrates

- [../contracts/](../contracts/) defines interface and API-contract surfaces.
- [../security/](../security/) covers threat model and security posture.
- [../operations/](../operations/) covers operational runbooks and recovery.
- [../stynx/package-architecture.md](../stynx/package-architecture.md) is the
  consumer-facing package topology guide.
