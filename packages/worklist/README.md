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

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `zod`: `^4.3.6`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@nestjs/platform-express`: `^11.1.19`
- `@nestjs/testing`: `^11.1.19`
- `@stynx-nyx/testing`: `workspace:*`
- `@types/node`: `24.12.4`
- `ts-node`: `^10.9.2`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
