---
adr_id: ADR-SIGNATURE-0002
title: Minimal PAdES-B-LTA verification and trust-profile sets
status: accepted
date: 2026-10-05
authors: ['Architect']
tags: [stynx, signature, pades, lta, trust, health, security, detran]
supersedes: ADR-SIGNATURE-0001 LTA fail-closed scope and single-profile health composition (decision 4) only
---

# ADR-SIGNATURE-0002 — Minimal PAdES-B-LTA verification and trust-profile sets

**Status:** Accepted. This ADR is specification only. It authorizes no source,
test or workflow change by itself, and it is no release evidence. D1 carries an
Owner release condition.
**Authority:** Architect, recording the Owner decisions of 2026-10-05 on
stynx-nyx/stynx#318 (DETRAN C-0002, consumer round R-0022, contract CTG-0006).
**Amends:** [ADR-SIGNATURE-0001](ADR-SIGNATURE-0001-trust-evidence.md). Every
decision of that ADR that this ADR does not name stays in force.

## Context

STYNX 1.5.3 (`main@2505251f`) closed UPS-SIG-06. Two requests remain:

- **UPS-SIG-05.** The `stynx-cms` verifier does not verify archive
  timestamps. DETRAN's Owner chose that verifier (OD-R22-06) and holds every
  clinical document kind that requires LTA at a checkpoint until it does
  (OD-R22-40). This is the blocking item of DETRAN's clinical signature
  migration.
- **UPS-SIG-07.** DETRAN mounts `StynxSignatureModule` once (OD-R22-13) and
  serves several state agencies, each with its own trust profiles.

Verified state of `packages/signature/src` at `main@2505251f`:

- `cms-trust-verifier.ts:196` reports `lta:false` unconditionally.
  `cms-trust-verifier.ts:330-331` throws the trust error
  `Archive timestamp evidence unavailable` when the profile has `requireLta`
  or requires `PAdES-B-LTA`.
  `signature.service.ts:87` refuses readiness for such a profile when the
  verifier does not report LTA.
- `pdf-trust-evidence.ts:202-232` (`readPdfTrustEvidence`) accepts either no
  bytes after the signed revision or exactly one appended revision whose only
  catalog change is one new `/DSS` key (`:219-221`), with every earlier
  object unchanged. A real B-LTA file is therefore rejected as
  `Post-signature modification` before any archive check.
- `cms-trust-verifier.ts:277` takes the certificate validation time from the
  signature timestamp or the signing time, by `profile.atTime`.
- Anchors are an intersection: signer anchors are the profile's anchors that
  the verifier also holds (`:203`); TSA anchors are the verifier's TSA anchors
  (or its anchors) that the profile also lists (`:255-256`).
- In production `capabilities(profile)` requires `readinessChallenge`, whose
  result must carry the same profile `id` and `revision` and pass full
  verification (`:187-195`).
- `StynxSignatureModuleOptions.trustProfile` is a single optional profile
  (`types.ts:241`). The boot guard returns early unless that one profile is
  `production` (`signature.module.ts:24`). `SignatureHealthIntegration.forRoot`
  builds one indicator from it (`readiness.ts:39`).
- Private keys of committed test PKI are admitted to the Semgrep fixture
  boundary by exact path only (`.semgrepignore`, ADR-STYNX-1.5.2-PKI-FIXTURE-SCAN).

ADR-SIGNATURE-0001 scopes itself to SIG-01…04; its contract documents LTA as
not implemented and fail closed.

## Decision

Decision identifiers are stable. Cite them as `ADR-SIGNATURE-0002 D1` and
`D2`.

### D1 — Minimal B-LTA in the `stynx-cms` verifier (UPS-SIG-05, option B)

**Amends** ADR-SIGNATURE-0001 decision 2 (what `createCmsTrustVerifier`
verifies) and decision 3 (fail-closed signing and verification), by admitting
one archive shape. Everything outside that shape stays fail closed.

1. **Accepted shape, exactly.** After the signed revision the file contains
   exactly two incremental revisions, in this order, and nothing after them:
   1. one DSS revision, with the rules `readPdfTrustEvidence` applies today;
   2. one document timestamp revision that adds one signature of type
      `DocTimeStamp` with sub-filter `ETSI.RFC3161` and only the objects
      needed to hold it.

   The allowed object changes of the second revision are an explicit
   allow-list in the implementation. Any other change, in either revision, is
   `Post-signature modification`.

2. **Coverage.** The document timestamp's byte range covers the whole file
   from byte zero to the end of its own revision, except its own token, and
   therefore covers the signed revision and the DSS revision. Its RFC 3161
   message imprint equals the digest of that range. Its revision ends at the
   end of the file.
3. **Archive TSA trust.** The token signature, the timestamping key purpose
   and the certificate path of the archive TSA are verified with the checks
   the verifier already applies to the signature timestamp. Archive TSA
   anchors come from an additive, explicit verifier option with no fallback
   to the general anchor lists, intersected with the profile's anchors under
   the existing model. Revocation of the archive TSA certificate is verified.
4. **Validation time.** Let the archive time be the `genTime` of the verified
   document timestamp. Under an LTA profile:
   - the signer certificate path, the signature timestamp and its TSA, and
     the revocation status of each are evaluated **at the archive time**,
     using only evidence carried in the DSS revision that the document
     timestamp covers; every freshness rule that today compares with the
     current time compares with the archive time instead;
   - signing time and signature-timestamp time must not be later than the
     archive time, and revocation evidence in the DSS must not be produced
     after it; otherwise verification fails;
   - `profile.atTime` does not select the validation time for an LTA profile;
   - the archive TSA certificate itself is evaluated **at the current
     verification time**, with revocation evidence that meets the existing
     freshness rule.
5. **Result.** A verified artifact yields `padesProfile: 'PAdES-B-LTA'`, the
   archive time as an additive proof field, and a proof-level LTA indication.
   `capabilities(profile)` reports `lta: true` **only** when archive TSA
   anchors are configured and, in production, the readiness challenge for
   that profile is itself a B-LTA artifact that verified. Otherwise it
   reports `lta: false` and an LTA profile is not ready.
6. **Explicit limits.** The following are refused under an LTA profile and
   are not partially supported:
   - more than one DSS revision, or a DSS revision after the document
     timestamp;
   - more than one document timestamp, chained or renewed archive
     timestamps, and any timestamp-renewal chain;
   - an archive TSA certificate that is expired, revoked or outside the
     archive anchors at verification time; the lifetime of a proof is
     therefore bounded by that certificate;
   - a signer certificate that expired or was revoked between signing and the
     archive time, even where a broader validation model would accept it;
   - more than one signature in the document; any revision that changes
     visible content, form fields or metadata.

   Each yields the existing typed `SignatureTrustError` or
   `SignatureTrustUnavailableError`, never a positive proof.

7. **Non-LTA profiles unchanged.** Under a profile that neither sets
   `requireLta` nor requires `PAdES-B-LTA`, results are those of 1.5.3,
   including rejection of the two-revision shape. A B-LT-only artifact is
   refused under an LTA profile.
8. **Change surface.** `readPdfTrustEvidence` and its single-revision guard in
   `pdf-trust-evidence.ts`; the capability report and the LTA refusal in
   `cms-trust-verifier.ts`; the additive archive-anchor option and proof
   fields in `types.ts`. `signature.service.ts` needs no rule change: its
   readiness check already depends on the reported capability.
9. **Owner release condition.** An **independent security review** of the D1
   implementation is required before any release that contains it. The
   review is performed by a party that did not write the implementation or
   its tests, covers at least the revision allow-list, byte-range coverage,
   the time model and the fixtures, and is recorded with the release
   evidence. Until it is recorded, D1 code may merge but the fixed group is
   not published with it.

### D2 — Several trust profiles in one mounted module (UPS-SIG-07, option A)

**Amends** ADR-SIGNATURE-0001 decision 4 (health composition and boot guard),
which today assumes one profile.

1. **Option.** `StynxSignatureModuleOptions` gains an additive
   `trustProfiles` list alongside `trustProfile`. The declared set is the
   single profile, if present, plus the list. Two entries with the same `id`
   are a configuration error; one revision per `id` is mounted at a time.
2. **Boot guard.** The guard evaluates every declared profile. If any is
   `production`, the existing production conditions apply to the module:
   branded verifier or acknowledged consumer-owned verifier, non-simulated
   backend, registered health witness. A violation prevents startup.
3. **Declared profiles only.** When `trustProfiles` is configured, a regulated
   call whose `production` profile is not in the declared set, by `id` and
   `revision`, fails closed with a typed configuration error. Without
   `trustProfiles`, per-call profiles behave as in 1.5.3.
4. **Health details per profile.** The indicator checks each declared profile
   and reports, per profile, its `id`, `revision`, status, capabilities and
   verifier kind, or the reason it is down. With only `trustProfile`
   configured, the health output keeps its 1.5.3 shape.
5. **Aggregation.** One additive option selects the rule. `all`, the
   default, reports the indicator down when any declared production profile
   is down; this keeps decision 4's "a failed check makes readiness down".
   `any` reports it up while at least one declared production profile is
   ready, with the failing profiles visible in the details. Aggregation never
   authorizes: signing and verification under a profile that is not ready
   still fail closed on each call. A missing indicator still prevents
   startup.
6. **Anchor model, documented.** The contract documents the existing
   intersection model, including that a TSA anchor must also be listed by the
   profile, and the recommended single verifier: the union of all profiles'
   anchors. The intersection guarantees that the union widens no profile's
   trust: an artifact anchored only in one tenant's profile is refused under
   another tenant's profile.
7. **Challenge artifact, documented.** The contract documents what
   `readinessChallenge(profile)` returns for each profile: real signed bytes
   that verify fully under that profile, labelled with its `id` and
   `revision`. A revision change without a new challenge leaves that profile
   not ready. The same underlying artifact may serve two profiles only if it
   verifies independently under each. STYNX does not cache a challenge
   result across profiles. For an LTA profile the challenge is a B-LTA
   artifact (D1 item 5).
8. **Resolution stays with the consumer.** Choosing the profile for a request,
   by tenant and document kind, remains consumer code. STYNX adds no tenant
   registry and embeds no anchor, policy identifier or level.

## Consequences

- **Compatibility.** Both decisions are additive. Without archive anchors and
  without `trustProfiles`, behaviour and output are those of 1.5.3. New
  options and proof fields move the `@stynx-nyx/signature` API baseline; the
  Architect rebinds it and the trace after implementation and updates
  `docs/framework/contracts/signature.md` with it.
- **Security.** D1 is the highest cryptographic risk among the 1.5.x
  requests. Its acceptance is deliberately narrower than ETSI B-LTA: valid
  real-world files with a second DSS or a renewed timestamp are refused.
  That is the decided trade, not a defect.
- **Fixtures.** D1 needs new real-PKI fixtures, including an archive TSA key.
  Each new private-key fixture path must be admitted to `.semgrepignore` by
  exact path through a further Architect decision and bound by the Inspector
  test that pins that list, as ADR-STYNX-1.5.2-PKI-FIXTURE-SCAN did. No
  directory glob is permitted.
- **Operations.** Consumers provision archive TSA anchors and an LTA
  challenge artifact per LTA profile, and must renew artifacts before the
  archive TSA certificate expires, because renewal chains are not verified.
- **No migration.** Neither decision touches a database.

## Verification obligations

Evidence uses real test PKI in the manner of
`packages/signature/test/integration/trust-gate.spec.ts`; no mocked
cryptography counts.

| Decision | Required evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1       | A valid B-LTA artifact is accepted with `padesProfile: 'PAdES-B-LTA'` and the archive time. Refused: a B-LT-only artifact under an LTA profile; a tampered document timestamp; an archive TSA outside the archive anchors; a missing document timestamp; a timestamp that does not cover the DSS revision; a signature or revocation instant after the archive time; a second DSS; a second or chained document timestamp; an expired or revoked archive TSA certificate; any extra object change in either revision.                  |
| D1       | `checkReadiness` under an LTA profile is ready with archive anchors and a valid B-LTA challenge, and raises `SignatureCapabilityError` without them. `lta: true` is never reported unverified. Every non-LTA case of the existing suites keeps its 1.5.3 result.                                                                                                                                                                                                                                                                       |
| D1       | The independent security review record (item 9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D2       | Two production profiles with disjoint anchors, mapped to two tenants by a consumer-side resolver: tenant A's artifact under tenant B's profile is refused; health shows each profile with its own state; an invalid challenge in one profile brings down only that profile under `any` and the indicator under `all`; a revision change without a new challenge leaves the profile not ready; startup is refused for a production profile without a trusted verifier or witness; an undeclared production profile is refused per call. |
| D2       | With only `trustProfile`, the boot guard and the health output equal 1.5.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Implementation order

1. D2 first: it is smaller, has no cryptographic change, and its per-profile
   challenge rule is what D1 item 5 reports through.
2. D1: fixtures and negative sensors, then the parser allow-list, then the
   time model and capability report.
3. The independent security review, then release.

In the DETRAN campaign ADR-OUTBOX-0003 D1 precedes both.

## Deferred and declined

- Declined in this decision: full ETSI B-LTA validation, timestamp renewal
  chains, chained document timestamps, a DSS after the document timestamp,
  multiple signatures under LTA.
- Unchanged: the `consumerOwnedVerifier` route remains available and is still
  recorded as `consumer-owned`.
- Not decided: more than one mounted revision per profile `id`; a STYNX-side
  tenant-to-profile registry.

## Open points for Owner confirmation

1. **Time of the archive TSA check (D1 item 4).** "Validation time taken from
   that timestamp" settles the signer side. It cannot settle the archive
   TSA's own certificate, which nothing later protects. This ADR evaluates it
   at the current verification time with fresh revocation evidence, the most
   conservative reading. Confirm.
2. **Signer certificate at the archive time (D1 items 4 and 6).** The chosen
   rule refuses a signer certificate that was valid when signing but expired
   or was revoked before the archive timestamp. Confirm that this stricter
   outcome is intended.
3. **Second DSS (D1 item 6).** Files produced by common B-LTA tooling often
   append validation data for the document timestamp in a second DSS. The
   chosen shape refuses them. DETRAN's signing provider must emit the minimal
   shape; confirm that DETRAN has verified this before D1 is built.
4. **Reviewer (D1 item 9).** Name who performs the independent security
   review and where its record lives.
5. **Undeclared profiles (D2 item 3).** Refusing an undeclared production
   profile once `trustProfiles` is set is this ADR's fail-closed addition, so
   that no production profile escapes the boot guard and health. Confirm.
6. **Default aggregation (D2 item 5).** `all` is the default. Confirm.
