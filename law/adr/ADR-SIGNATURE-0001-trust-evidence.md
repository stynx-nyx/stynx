# ADR-SIGNATURE-0001 — Verified trust evidence for regulated signatures

**Status:** Proposed for Architect review
**Date:** 2026-09-28
**Authority:** Architect
**Scope:** `@stynx-nyx/signature` opt-in trust profiles and SIG-01…04

## Context

The existing signing facade computes the source hash but may accept provider assertions about certificate status, signing time and signed bytes. Its fallback can construct synthetic CMS or use a local clock. The mock backend deliberately produces synthetic evidence. Those behaviors are useful for existing tests and legacy callers, but cannot prove an ADVANCED or QUALIFIED signature, a trusted minutes manifest, or production readiness. DETRAN C-0002 A1 §8.1 promotes UPS-SIG-01…04 to MUST. DETRAN ADR-0018 owns its document-kind profile matrix and trust-anchor decisions; STYNX must offer a generic boundary.

## Decision

1. Regulated calls explicitly opt in with a minimum signature level and a versioned consumer trust profile. Absence of that field preserves the published legacy call behavior, without conferring a regulated level.
2. A separate `SignatureTrustVerifier` validates exact signed bytes and evidence under consumer supplied anchors/policy. A backend's level, `good`, chain, timestamp, URI or capability declaration is not an authority. It can provide evidence to inspect, not its verdict. ADVANCED and QUALIFIED are achieved only from the verified predicates; the consumer supplies its legal/certificate-policy criteria, including ICP-Brasil roots and qualification OIDs where relevant. STYNX does not assert legal validity solely from a PAdES profile.
3. Production trust rejects simulated backends, `/mock`, synthetic CMS and local-time substitution. Signing fails closed on missing capability, missing CMS/PAdES, untrusted chain, TSA, revocation or insufficient level. Verification distinguishes invalid evidence from indeterminate/unavailable evidence; neither authorizes the requested minimum.
4. Health composition is structural: `signature` exports an indicator implementing the existing `health` indicator shape. This avoids dependency from `health` into `signature` and prevents required checks from being treated as optional skipped callbacks.
5. Session and batch manifests use RFC 8785 canonical JSON, versioned schema, source document and tenant/snapshot identity, ordered signer proofs and a cryptographic signed-manifest binding. The existing digest-only sequential envelope is not upgraded by naming it a signature.
6. Withdrawal verification returns typed results and preserves the consumer port's complete receipt field set. Physical withdrawal requires a trusted attestor and signed binding, while digital withdrawal requires cryptographic verification. The consumer owns eligibility and mapping to domain errors.

## Consequences

Consumers must provision a real trust verifier, anchors, policy revisions, TSA/revocation rules and any physical attestor. Production readiness is down until these are operational. Existing test doubles stay available for legacy/test flows, while Inspector fixtures for the new trust gate need independent cryptographic evidence. No private-key storage or DETRAN business profile moves into STYNX. The contract in `docs/framework/contracts/signature.md` defines the typed API and negative sensors.

## Rejected alternatives

- Trust a provider JSON receipt or capability flag: it allows self-certified success.
- Infer QUALIFIED from PAdES-B-LT or a chain name: PAdES level and legal certificate qualification are different predicates.
- Reuse `sha256CanonicalJson` or `SequentialSigner` as the minutes signature: neither verifies PAdES/certificate evidence per signer or RFC 8785 bytes.
- Make `health` import `signature`: it reverses package direction and makes the generic health package know a domain-specific capability.
