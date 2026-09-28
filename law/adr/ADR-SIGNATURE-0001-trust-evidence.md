---
adr_id: ADR-SIGNATURE-0001
status: accepted
date: 2026-09-28
authors: [Architect]
---

# ADR-SIGNATURE-0001 — Verified trust evidence for regulated signatures

**Scope:** `@stynx-nyx/signature` opt-in trust profiles and SIG-01…04

## Context

The existing signing facade computes the source hash but may accept provider assertions about certificate status, signing time and signed bytes. Its fallback can construct synthetic CMS or use a local clock. The mock backend deliberately produces synthetic evidence. Those behaviors are useful for existing tests and legacy callers, but cannot prove an ADVANCED or QUALIFIED signature, a trusted minutes manifest, or production readiness. DETRAN C-0002 A1 §8.1 promotes UPS-SIG-01…04 to MUST. DETRAN ADR-0018 owns its document-kind profile matrix and trust-anchor decisions; STYNX must offer a generic boundary.

## Decision

1. Regulated calls explicitly opt in with a minimum signature level and a versioned consumer trust profile. Absence of that field preserves the published legacy call behavior, without conferring a regulated level.
2. STYNX ships `createCmsTrustVerifier`, a concrete `SignatureTrustVerifier` implementation. It verifies CMS/PAdES over the PDF ByteRange, X.509 path to injected anchors and policy OIDs, RFC 3161 TSA signature/imprint/time, and signed OCSP/CRL status and freshness. The consumer supplies anchors, policy and qualification predicates plus authenticated evidence fetchers, not the cryptographic mechanism. A backend's level, `good`, chain, timestamp, URI or capability declaration is not an authority. ADVANCED and QUALIFIED derive from verified predicates. A custom verifier is consumer-owned and cannot reuse a provider verdict as proof. STYNX does not assert legal validity solely from a PAdES profile.
3. Production trust rejects simulated backends, `/mock`, synthetic CMS and local-time substitution. Signing fails closed on missing capability, missing CMS/PAdES, untrusted chain, TSA, revocation or insufficient level. Verification distinguishes invalid evidence from indeterminate/unavailable evidence; neither authorizes the requested minimum.
4. For a production trust profile, signature owns health composition and a boot guard verifies registration of its required indicator. A missing indicator prevents startup; a failed check makes readiness down. Dependency direction is signature → health, never health → signature.
5. Session and batch manifests use RFC 8785 canonical JSON, versioned schema, source document and tenant/snapshot identity, ordered signer proofs and a cryptographic signed-manifest binding. The verifier accepts `expectedManifestSha256` and derives `boundManifestSha256` only from a signed CMS attribute or signed PDF content within the verified ByteRange. A free-text reference is invalid. The existing digest-only sequential envelope is not upgraded by naming it a signature.
6. Withdrawal verification returns typed results and preserves the consumer port's complete receipt field set. Physical withdrawal requires a trusted attestor and signed binding, while digital withdrawal requires cryptographic verification. The consumer owns eligibility and mapping to domain errors.

## Consequences

STYNX must add runtime `pkijs`, `asn1js` and `@peculiar/x509` dependencies under the maestro's shared lock and ship/test the concrete verifier against real test-PKI fixtures. Consumers provision anchors, policy revisions, TSA/revocation evidence fetchers and any physical attestor. Production readiness is down until these are operational. Existing test doubles stay available for legacy/test flows. No private-key storage or DETRAN business profile moves into STYNX. The contract in `docs/framework/contracts/signature.md` defines the typed API and negative sensors.

## Rejected alternatives

- Trust a provider JSON receipt or capability flag: it allows self-certified success.
- Infer QUALIFIED from PAdES-B-LT or a chain name: PAdES level and legal certificate qualification are different predicates.
- Reuse `sha256CanonicalJson` or `SequentialSigner` as the minutes signature: neither verifies PAdES/certificate evidence per signer or RFC 8785 bytes.
- Make `health` import `signature`: it reverses package direction and makes the generic health package know a domain-specific capability.
