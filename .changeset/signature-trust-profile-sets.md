---
'@stynx-nyx/signature': patch
---

UPS-SIG-07 (ADR-SIGNATURE-0002 D2): declare several trust profiles in one mounted module. `StynxSignatureModuleOptions` gains `trustProfiles` (the declared set is `trustProfile` plus the list; a repeated `id` is a configuration error at `forRoot`) and `trustProfileAggregation` (`all`, the default, or `any`). The boot guard evaluates every declared profile. Once `trustProfiles` is configured, a regulated `sign`, `verify` or `checkReadiness` naming a production profile outside the set fails closed with the new `SignatureProfileNotDeclaredError`, and the declared entry governs the call. `SignatureReadinessIndicator` accepts a profile list and reports each profile's `id`, `revision`, status, capabilities and verifier kind in `details.profiles`; `SignatureHealthIntegration.forRoot` wires it. `declaredTrustProfiles` is exported. With only `trustProfile`, boot and health output are those of 1.5.3.
