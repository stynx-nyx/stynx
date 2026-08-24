# `@stynx-nyx/worklist`

Tenant-scoped work distribution for STYNX applications. The package provides
RBAC-derived queues, atomic claiming, pull/round-robin/load-balanced and custom
strategies, audited assignment operations, and SLA/prazo clocks.

Worklist composes with `@stynx-nyx/flow`; it does not replace Flow tasks or
domain state machines. Enqueue a Flow task as a polymorphic reference and
coordinate completion explicitly in the host application.

See `docs/framework/contracts/worklist-api.md` and
`law/adr/ADR-WORKLIST-0001-flow-boundary-distribution-sla.md` for the contract
and boundary decision.
