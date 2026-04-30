# @stynx/contracts

Framework-agnostic contracts for STYNX platform packages. This package owns shared DTOs, interfaces, and error types that are consumed across backend, storage, audit, identity, tenancy, and authorization modules.

## Public Surface

Exports are intentionally type-first and implementation-free:

- auth and authorization principals, requirements, and policies
- audit envelopes and sink contracts
- storage metadata and object interfaces
- DB context and tenancy resolver contracts
- identity-admin adapter contracts
- shared error envelopes

Use this package when two STYNX packages need a stable compile-time contract without depending on each other's runtime implementation.
