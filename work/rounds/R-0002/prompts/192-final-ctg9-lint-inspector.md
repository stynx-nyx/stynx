# Inspector — final CTG9 lint sensor repair

Declare Inspector. Read AGENTS.md and STYNX authorities in order. The
first final `pnpm ci:stynx` stopped in `lint:tests` on WAVE-05A/CW-1:
six existence-only assertions in five CTG9 test files. The local final
version marker was uncommitted and the tree restored to pre mode.

Edit ONLY the six assertions below and the smallest helper parameter/
call-site adjustments needed for the withdrawal proof. Preserve or
increase their proof:

- `packages/backend/test/integration/ctg9-outbox-sse.integration.spec.ts:159`: cross-tenant lookup must return the exact `null` result.
- `packages/signature/test/integration/trust-gate.spec.ts:626,740`: assert attached CMS `eContentType` is id-data `1.2.840.113549.1.7.1` and its `eContent` bytes equal `Buffer.from('Unrelated CMS content, not the selected PDF ByteRange.')` (55 bytes). Keep the existing rejection of that attached content. Legacy signature level is exactly `undefined`.
- `packages/signature/test/unit/manifest.spec.ts:446`: replace `not.toBeNull()` with a value assertion on ByteRange captures; assert start `'0'`, `before < after`, and `after + tail === pdf.length`. Do not keep any zero-argument existence matcher, even behind `.not`.
- `packages/signature/test/unit/readiness.spec.ts:142`: assert the exported health integration has the expected constructor/function type and class name `SignatureHealthIntegration`.
- `packages/signature/test/unit/withdrawal.spec.ts:86`: assert `verifiedHashes` equals `{documentSha256: hex(sourceDocument), evidenceSha256: hex(expectedEvidenceBytes)}`. The physical caller uses `evidenceBytes` (`attestation.cms.der`) and the digital caller uses `declarationCmsSignature` (`withdrawal-blt.cms.der`). Add a **required** expected-evidence parameter to `assertValidReceipt` and update both call sites so each checks its own known fixture bytes; do not derive expected values from production output.

Run `pnpm lint:tests` and the focused changed tests (including PostgreSQL
where the backend test requires it). No deletion, skip, weakening,
implementation change, law/docs/generated edits, or Git. Report exact
files and test results, plus `pnpm check:trace --print` showing the five
expected stale projections. The maestro commits the Inspector diff;
Architect then rebinds `law/trace.json`, and only afterward Engineer
regenerates the final marker and repeats `pnpm ci:stynx`.
