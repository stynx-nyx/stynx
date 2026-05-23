# Invariants

**Authority:** Architect (Constitution Article 6).

This directory contains the active machine-readable stynx invariants. JSON files
remain the canonical invariant instances and must validate against DEVAI's
schema registry.

## Active Areas

- RBAC and tenant access: `INV-RBAC-001.json`.
- Privacy and LGPD handling: `INV-PRIVACY-001.json`.
- Package topology and layering: `INV-PACKAGES-001.json`.
- Flow design/runtime behavior: `INV-FLOW-001.json`, `INV-FLOW-002.json`,
  `INV-FLOW-003.json`.
- Coverage, errors, and performance: `INV-COVERAGE-001.json`,
  `INV-ERROR-001.json`, `INV-PERF-001.json`.

Tests and docs should reference invariant IDs rather than duplicating their full
JSON bodies.
