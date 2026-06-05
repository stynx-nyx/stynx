# RFC 0002: GAP-001-audit-hash-chain

- Status: Implemented
- Source: [GAP-001-audit-hash-chain.md](../legacy/completed-gap-tasks/GAP-001-audit-hash-chain.md)

## Problem

The linked GAP is implemented by the append-only `audit.events` hash chain,
`StynxAuditService.verifyChain()`, and the `stynx audit verify` CLI command.

## Constraints

Follow the linked GAP acceptance criteria and the STYNX governance process.

## Options

See the source GAP document for detailed options and implementation notes.

## Decision

Keep the implemented application-layer verifier as the supported integrity
check. The SQL `audit.verify_chain()` helper is the CLI/runtime substrate;
the Nest service recomputes hashes independently for integration tests and
service consumers.

## Migration

No data migration is required beyond the existing `audit.events` hash columns
and trigger-computed row hashes. Future audit schema changes must preserve the
hash input contract or introduce a versioned verifier.

## Rollback

Revert the implementation commit and reopen this RFC as proposed if hash-chain
verification can no longer run against populated databases.
