# Signature contract — CTG9

**Status:** Architect contract for UPS-SIG-01…04. **Package:** `@stynx-nyx/signature`. Trust policy decision: [ADR-SIGNATURE-0001](../../../law/adr/ADR-SIGNATURE-0001-trust-evidence.md).

## Published API and compatibility

`SignatureService.sign(SignatureRequest): Promise<SignatureResult>`, `verify(VerifyRequest): Promise<VerifyResult>`, `StynxSignatureModule.forRoot`, `SequentialSigner`, `sha256CanonicalJson` and all current fields/exports remain usable. The new trust gate is opt-in per request. If `minimumSignatureLevel` is absent, signing and verification preserve existing behavior, including optional evidence, provider errors and mock use in tests. Such legacy results must not be relabelled ADVANCED/QUALIFIED without independent verification. `SequentialSigner` remains a legacy digest envelope; its digest is not a signature.

The public HTTP `/tsa/sign`, `/tsa/ocsp/validate` and `/pades/verify` wire endpoints retain their current request and response fields. New capability/trust fields are additive. An HTTP `good`, `valid`, level, chain or URI is an untrusted assertion until independently checked. `createMockSignatureBackend`, GovBR local sandbox, `/mock`, and current synthetic `mock-cms:` or `pades:` bytes never establish production trust. The current `ProviderBackedSignatureBackend` local-clock and synthetic-CMS fallbacks are prohibited when a minimum is requested. They remain confined to legacy calls.

## Typed trust gate — SIG-01

New exports in `packages/signature/src/types.ts` and `index.ts`:

```ts
type SignatureLevel = 'ADVANCED' | 'QUALIFIED';
type SignatureCapability = 'pades' | 'tsa' | 'lta' | 'ocsp' | 'crl';
type SignatureVerifierKind = 'stynx-cms' | 'consumer-owned';
interface SignatureTrustProfile {
  id: string;
  revision: string;
  environment: 'production' | 'test';
  minimumSignatureLevel: SignatureLevel;
  requiredPadesProfile: 'PAdES-B-T' | 'PAdES-B-LT' | 'PAdES-B-LTA';
  requireTsa: boolean;
  requireLta: boolean;
  revocation: 'ocsp' | 'crl' | 'ocsp-or-crl';
  trustAnchorsPem: readonly string[];
  acceptedPolicies?: readonly string[];
  atTime: 'signing-time' | 'trusted-timestamp';
}
interface SignatureCapabilities {
  simulated: boolean;
  pades: boolean;
  tsa: boolean;
  lta: boolean;
  certificateValidation: readonly ('ocsp' | 'crl')[];
  evidenceSource: string;
  checkedAt: Date;
}
interface SignatureTrustProof {
  verifierKind: SignatureVerifierKind;
  profileId: string;
  profileRevision: string;
  achievedLevel: SignatureLevel;
  padesProfile: 'PAdES-B-T' | 'PAdES-B-LT' | 'PAdES-B-LTA';
  originalDocumentSha256: string;
  signedDocumentSha256: string;
  cmsSha256: string;
  signerCertificateSha256: string;
  chainSha256: readonly string[];
  signedAt: Date;
  tsaAt: Date;
  certificateValidatedAt: Date;
  revocationSource: 'ocsp' | 'crl';
  verificationRef: string;
  boundManifestSha256?: string;
}
interface SignatureTrustVerifier {
  capabilities(profile: SignatureTrustProfile): Promise<SignatureCapabilities>;
  verifySignedArtifact(input: {
    tenantId: string;
    originalDocument: Uint8Array;
    signedDocument: Uint8Array;
    cmsSignature: Uint8Array;
    certificate: SignatureCertificateRef;
    profile: SignatureTrustProfile;
    expectedManifestSha256?: string;
  }): Promise<SignatureTrustProof>;
}
```

`SignatureRequest` and `VerifyRequest` gain `minimumSignatureLevel?: SignatureLevel` and `trustProfile?: SignatureTrustProfile`; `SignatureEvidence` and `VerifyResult` gain optional `signatureLevel?: SignatureLevel`, `verifierKind?: SignatureVerifierKind` and `trustProof?: SignatureTrustProof`. A minimum requires a profile, real verifier and backend; the profile minimum cannot be weaker than the request. `SignatureService` recomputes the original document hash, requires real nonempty signed PDF and CMS, invokes the verifier on exact returned bytes, compares every proof hash/certificate/profile binding, and only then returns `signed` with achieved level. QUALIFIED ranks above ADVANCED; a lower level throws `SignatureLevelNotMetError`. Backend self-declaration is not proof. The service sets `verifierKind` from its validated verifier configuration, never from provider output or a proof's self-declared string; it writes the same value to the result evidence and proof and rejects any mismatch.

STYNX ships `createCmsTrustVerifier(options): SignatureTrustVerifier` in new `packages/signature/src/cms-trust-verifier.ts`, exported from `index.ts`. This concrete implementation parses the PDF signature dictionary and ByteRange, requires complete nonoverlapping coverage except the CMS placeholder, checks CMS signed attributes and message digest against those exact ranges, verifies the CMS signature, builds and validates the X.509 path to injected anchors and allowed policy OIDs, verifies the RFC 3161 TSA token's CMS signature, message imprint and time, and verifies signed OCSP responses or CRLs, status and freshness at the selected time. It rejects untrusted embedded chains, inconsistent signer certificate, missing/epoch-zero or locally invented time, absent revocation and unsupported profiles. `options` accepts consumer anchors, policy/qualification predicates, time/freshness limits and independently authenticated TSA/OCSP/CRL fetchers; it never accepts a provider verdict as proof. The consumer selects the profile matrix and identity mapping. STYNX does not hardcode DETRAN policy or infer legal qualification merely from PAdES-B-LT.

The factory privately brands returned verifier instances in a module-local `WeakSet`; the brand is not a public structural property that a provider or consumer can forge by returning `{ verifierKind: 'stynx-cms' }`. A production `StynxSignatureModule.forRoot` accepts a verifier only if it has this brand, or if the consumer explicitly supplies `consumerOwnedVerifier: { acknowledged: true }` alongside the custom verifier. An unbranded custom verifier without that acknowledgement fails at boot with `SignatureProviderConfigurationError`, before any sign, verify or readiness result. The acknowledged path records `verifierKind: 'consumer-owned'` in every proof/evidence/readiness detail; it is not represented as STYNX-verified qualification. A provider response or a custom verifier that only repeats its response cannot satisfy a STYNX-owned ADVANCED/QUALIFIED claim. This acknowledgement assigns responsibility for the custom cryptographic implementation to the consumer; the STYNX concrete path remains the default and is the path tested for STYNX conformance.

Implementation dependencies required under the maestro's shared package/lockfile/changeset/generated-README lock: add runtime `pkijs`, `asn1js` and `@peculiar/x509` to `packages/signature/package.json`; resolve compatible exact versions in `pnpm-lock.yaml` and update the generated dependency README with its generator. Existing `stynxProviderDependencies` entries are informational and do not install these libraries. No downloaded-on-demand verifier is permitted. Inspector's real test-PKI fixtures run against `createCmsTrustVerifier`, not a mocked verifier port.

`SignatureProviderConfigurationError` covers missing backend/profile/verifier. Add `SignatureCapabilityError`, `SignatureTrustError`, `SignatureLevelNotMetError` and `SignatureEvidenceMismatchError`, extending `SignatureError` with stable codes and redacted details. Provider timeout/unavailability and malformed response preserve `SignatureProviderError`/`SignatureProviderResponseError`; no `signed` result follows. Opt-in `verify` returns `valid` only with independent proof, `invalid` for definite signature/binding failure and `unknown` for genuinely indeterminate or unavailable trust evidence. Missing local signed bytes remain `SignatureVerificationInputError`; `invalid` and `unknown` both refuse a minimum-level workflow. No key, token or PEM appears in exceptions.

## Typed readiness — SIG-02

`SignatureService.checkReadiness(profile)` returns `{ok:true, capabilities}` or throws configuration/capability error. It requires the selected PAdES profile, TSA, LTA if required, and the permitted OCSP/CRL mode; `simulated` is always down for a production profile. A claimed capability needs a functioning configured verifier (trusted handshake or signed challenge), not arbitrary `/health` JSON. Timeout, absent check, malformed or stale observation and missing capability are down. `SignatureReadinessIndicator` exported by `signature` has `name:'signature'` and `check(): Promise<{status:'up'|'down';details?:Record<string,unknown>}>`, structurally matching `StynxHealthIndicator` in `packages/health/src/tokens.ts`.

For a configured production profile, `StynxSignatureModule.forRoot` requires the signature-owned `SignatureHealthIntegration.forRoot({signatureOptions, healthOptions, otherIndicators})` composition path. That helper mounts `StynxHealthModule.forRoot` with the exact signature indicator instance and exports a registration witness. An `OnApplicationBootstrap` guard in `StynxSignatureModule` checks both the verifier brand/acknowledgement and that the witness belongs to that indicator and the health registration; omission fails startup with a typed configuration/capability error, before readiness can report `up/skipped`. The helper may depend on `health` (signature → health); `health` never imports `signature`. Applications without a production profile retain independent module mounting. A failed probe yields `signature: down` and failing `/readiness`.

## Canonical session and batch manifests — SIG-03

New `packages/signature/src/manifest.ts` exports `SignatureManifestService.prepareSession`, `.prepareBatch`, `.appendVerifiedSigner`, `.verifyManifest` and their types. Both manifests contain `manifestVersion:'1'`, `canonicalization:'RFC8785-JCS'`, kind (`session-minutes` or `batch-minutes`), tenant, aggregate, immutable document ID, document kind, source document SHA-256, snapshot SHA-256, required signer IDs in order and a real `preparedAt` UTC instant. Session also binds session/minutes IDs; batch binds batch ID. `manifestSha256` hashes exact UTF-8 RFC 8785 canonical bytes excluding itself. There is no implicit sorting of signers.

Each signer entry binds 1-based order, signer ID, actual nonzero `signedAt` and TSA instant, signature ID, signed PDF hash, CMS hash, certificate DER hash, chain hashes, PAdES profile, achieved level, revocation proof reference, profile revision, previous entry hash and manifest hash. Its entry hash covers all fields with tenant/document hash. `appendVerifiedSigner` takes actual artifact bytes and invokes `createCmsTrustVerifier.verifySignedArtifact({ ..., expectedManifestSha256: manifest.manifestSha256 })`; it requires `trustProof.boundManifestSha256` to equal that expected hash and rechecks the expected signer. The verifier obtains `boundManifestSha256` from a signed CMS attribute or signed document field within the verified ByteRange, never from unsigned metadata or the caller's echo. If the cryptographically covered value is absent or differs, it fails. Final seal binds ordered entry hashes. `verifyManifest` recomputes all hashes against consumer-supplied source bytes/snapshot, requires exact signer cardinality/order and invokes the same concrete verifier for each signature, chain, TSA and revocation proof with the expected manifest hash. Result: `status:'valid'|'tampered'|'untrusted'|'unavailable'` with stable reason codes; only valid authorizes use.

RFC 8785 serialization rejects `Date`, `undefined`, `bigint`, nonfinite numbers, binary objects, sparse arrays, accessors, duplicate parsed keys, cycles and unsupported prototypes. Binary is represented by lowercase 64-character SHA-256 hex. All instants must be real RFC 3339 UTC `Z` strings strictly after Unix epoch. `packages/signature/src/digest.ts` `canonicalJson` is not reused: its serialization of `Date`/`undefined`/binary does not meet this contract. Include canonical Unicode/number vectors.

## Withdrawal evidence — SIG-04

`packages/signature/src/withdrawal.ts` exports `SignatureWithdrawalVerifier.verifyWithdrawalEvidence(input): Promise<WithdrawalVerificationResult>`. Input binds tenant, case, document ID, exact document bytes/hash, eligible party IDs, evidence bytes/reference and consumer trust profile. Result is `{status:'valid';evidence:VerifiedWithdrawalEvidence}` or `{status:'tampered'|'ineligible'|'untrusted'|'unavailable';reasons:string[]}`. Valid evidence preserves **every** DETRAN port value: `tenantId`, `caseId`, `documentId`, `contentHash`, `signerPartyId`, `verificationMethod:'physical_verified'|'digital_verified'`, `evidenceRef`, `verifiedAt`, and adds proof reference and verified hashes. Digital proof verifies the signature under the profile; physical proof needs a consumer trusted attestor whose signed record binds observed document hash, named party, case and time. Neither a free text `physical_verified` flag nor a JSON receipt suffices. Cross-tenant/case/document/hash evidence is tampered; an ineligible party is ineligible. Missing proof or unavailable verifier is unavailable. STYNX does not emit `RAIT.*` codes; the consumer maps typed outcomes to its own errors.

## Inspector sensor obligations

The Inspector owns tests after this contract. Cover absence of backend/profile/verifier, mock and `/mock`, synthetic CMS, forged level, insufficient level, wrong document/certificate, untrusted chain, wrong policy OID, expired/revoked certificate, unsigned/stale TSA, OCSP/CRL policy branches, missing LTA, provider timeout and epoch zero. Positive and negative cryptographic fixtures use a real test PKI and run against STYNX `createCmsTrustVerifier`; doubles never establish production qualification. Test production boot with an unbranded verifier and no acknowledgement (fails), a forged `verifierKind:'stynx-cms'` property (fails), acknowledged custom verifier (records `consumer-owned` in proof/evidence/readiness), and a provider-echo verifier (never yields a STYNX-owned qualification claim). Test each capability present/absent, profile restrictions, production bootstrap without health integration, and health failure. For manifests mutate each bound field and each signer proof field separately; cover missing/duplicate/reordered signers, non-JSON input, canonical vectors, fake digest, absent/mismatched CMS-signed `boundManifestSha256` and epoch zero. For withdrawal cover valid physical/digital attestations, forged attestor, wrong tenant/case/document/hash/party, missing ref and unavailable verifier. Preserve legacy tests and add a no-minimum regression for sign, verify, sequential signing and mock behavior.
