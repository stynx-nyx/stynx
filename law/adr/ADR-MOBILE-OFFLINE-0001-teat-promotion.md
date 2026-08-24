# ADR-MOBILE-OFFLINE-0001 — Promote TEAT's offline mobile runtime into STYNX

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owner:** Architect
- **Implementation role:** Engineer (W1.5)
- **Invariant:** `INV-OFFLINE-001`

## Context

TEAT proved an offline-first field workflow in its mobile runtime and offline-sync domain. STYNX
deferred offline client queueing as extension E6 and explicitly excluded native mobile shells.
Phase 1 now promotes the proven mechanics into reusable packages; this is not a clean-room rewrite
of TEAT's domain.

The source baseline is TEAT commit `acf53e14161bdc5e60ac901ef44aac7284e2c20f`. The principal
inputs and their SHA-256 digests were:

- `apps/mobile/src/app/mobile-runtime.ts` — `911f9b78737832276b907e267d045b9d66e6c6bd5690a7fa09b39303a1bca2c8`
- `apps/mobile/src/app/mobile-test-adapters.ts` — `585249b9524559a2cdf5f169b781973ab07c042b01269ddd43e187f82926cd63`
- `controllers/sync-batches.controller.ts` — `fe87aac4823ce7f0dedc018060ab0bd90f6df109a449ee0d9ba67cdd10ebf9d8`
- `controllers/numbering-reservation-commands.controller.ts` — `d516ff3bc4a873a7b1ce8e2cd7e1b069e29800cc32333359a03921de06e8d516`
- `services/offline-sync-commands.service.ts` — `9310644db8e91a3e48e9dbb1f495b49a741af532ae67e847f5039a1d995a0e50`
- `domain/offline-offline-sync/db/migration.sql` — `56cbf5957f8a0f6356edee30d7e20217aedf1c5819af696fb28bf1983a23df9e`
- `law/invariants/INV-OFFLINE-001.json` — `b55a91e0e3de7ada33ec0907579ba7ea285091c53ed85147fc3dd9793f719222`

## Decision

STYNX ships two packages:

1. `@stynx-nyx/mobile-runtime`, a framework-free TypeScript orchestrator with seven ports:
   encrypted store, crypto, clock, ID, STYNX session, printer, and backend client. Its normative
   sequence remains bootstrap session, install a published normative package, reserve numbering,
   create a draft, attach hash-first evidence, finalize offline, enqueue, submit, then resolve a
   simple conflict. The constructor rejects stores that do not declare encryption.
2. `@stynx-nyx/offline-sync`, a NestJS module for atomic numbering reservations, idempotent batch
   receipt, and conflict resolution. Its PostgreSQL migration uses tenant-leading keys and indexes,
   `ENABLE` plus `FORCE ROW LEVEL SECURITY`, and trusted STYNX request transactions.

The promotion generalizes these TEAT concepts:

- AIT becomes an open, consumer-defined `entityType`; STYNX defines no entity allowlist.
- AIT numbering ranges become entity-scoped numbering ranges. `trafficAgencyId` becomes neutral
  `orgUnitId`, while `series`, reservation expiry, and atomic interval allocation remain.
- Device-generated semantic IDs are bounded text, not assumed UUIDs.
- TEAT-specific policy guards are replaced by STYNX auth, permission, audit, idempotency, request
  context, and database boundaries.

TEAT retains its product vocabulary and policy: entity type `ait`, AIT payload fields, field-agent
roles, normative content, administrative measures, crashes, evidence semantics, and concrete API
adapter mappings. Those belong in the adopter, not these packages.

## Consequences and deferred work

Native mobile is now a supported consumer surface and E6 is delivered. The runtime deliberately
does not ship platform bindings. Consumers supply production adapters and may use the exported
`@stynx-nyx/mobile-runtime/testing` sandbox kit in tests.

The following remain explicitly out of scope:

- **Phase 5 / BOAT:** server-side device attestation must replace trust in client-asserted posture.
- Real Capacitor encrypted-store and session adapters.
- Camera, GPS, and printer hardware adapters.
- TEAT adoption: replace TEAT's local runtime and offline-sync module after these packages are
  published; map `trafficAgencyId` to `orgUnitId`, select `entityType: 'ait'`, migrate existing data,
  and retain TEAT parity tests through the cutover.

No package publication, main-branch mutation, or TEAT mutation is authorized by this ADR.
