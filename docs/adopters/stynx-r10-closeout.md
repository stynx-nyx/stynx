# STYNX R10 Closeout — Adopter Notes

- Package: `@stynx/signature` v0.1.0 workspace state with
  `.changeset/stynx-r10-signature-subset.md`.
- Surface changes:
  - `sha256`, `canonicalJson`, `sha256CanonicalJson`, `canonicalXmlDigest`.
  - `MockPadesEvidenceAdapter`, `createMockPadesEvidenceAdapter`,
    `encodePadesEvidenceBlock`, `decodePadesEvidenceBlock`.
  - `GovBrSandboxAdapter`, `createGovBrSandboxAdapter`,
    `govBrSandboxCallbackUrl`.
  - `SequentialSigner`, `verifySequentialEnvelope`,
    `readSequentialEnvelope`.
- Migration: SGP can replace local digest helpers in
  `backend/src/integrations-worker/{dctfweb,efd-reinf}/` and local sandbox
  helpers in `backend/src/auth/govbr/` / `backend/src/recrutamento/banca/`
  after its own R10 adoption pass updates imports from `@stynx/signature`.
- Fixture compat: all new helpers are deterministic and provider-free. The
  PAdES block uses a `%%STYNX-PADES-SIGNATURE:` marker; SGP may keep its
  existing `%%SGP-PADES-SIGNATURE:` marker until it intentionally updates
  goldens.
- Commands:
  - `pnpm --filter @stynx/signature test`
  - `pnpm --filter @stynx/signature typecheck`
  - `pnpm --filter @stynx/signature lint`
  - `pnpm --filter @stynx/signature build`
- Owner decisions: PDF/A conformance remains adopter-owned in R10. See
  [`ADR-PDF-A-BOUNDARY`](../adr/ADR-PDF-A-BOUNDARY.md).
