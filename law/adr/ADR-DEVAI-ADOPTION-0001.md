# ADR-DEVAI-ADOPTION-0001: Operational DEVAI adoption

- Status: Accepted
- Date: 2026-08-13
- Authority: Architect, under the Owner's explicit adoption authorization

## Context

STYNX has installed the public `@aarusso-nyx/devai@1.1.0` package and promoted
its product, law, policy, and trace substrates. Full adoption additionally
requires a real role-separated control-loop pilot and exact-candidate evidence.

## Decision

Run `R-0001` as a validation-only governed pilot. The pilot must use supported
DEVAI actions for every harness-state transition, provision task isolation
under `.devai/worktrees`, preserve all tests, and stop on any missing reference
or unsupported transition. A passing pilot may support operational-adoption
closure; a failed or incomplete pilot may not.

## Consequences

- Product behavior and package publication remain outside the pilot.
- DEVAI preview or internal plumbing is not promoted by assertion; observed
  behavior and recorded evidence decide readiness.
- Manual fabrication of DEVAI task, lock, triage, or proof state is prohibited.
