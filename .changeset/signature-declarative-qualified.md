---
'@stynx-nyx/signature': patch
---

Add an optional declarative QUALIFIED rule to `createCmsTrustVerifier`: `SignatureTrustProfile.qualifiedPolicies` (with a verifier-level `qualifiedPolicies` fallback) lists consumer-supplied certificate policy OIDs that confer QUALIFIED on a verified signer certificate. The proof records the attaining rule in the new optional `qualifiedBy` field (`certificate-policy` or `consumer-predicate`). Without the rule, verification is unchanged from 1.5.0.
