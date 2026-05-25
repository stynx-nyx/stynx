---
'@stynx/pdf-a-vera-docker': minor
---

Add the digest-pinned veraPDF Docker validator adapter, JSON report
normalization, Docker timeout handling, fixture corpus, and bench gate.

Adoption notes: this package requires Docker runtime access. Existing PDF bytes
are unchanged; adopters wire the adapter behind the `@stynx/pdf-a` contract and
may override the pinned image only through explicit environment policy.
