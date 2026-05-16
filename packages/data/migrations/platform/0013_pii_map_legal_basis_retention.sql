-- C-4 pilot, Session S1.F-6 (closes INV-PRIVACY-001 known violation for record.email).
--
-- Adds legal_basis (LGPD Art. 7 / GDPR Art. 6 lawful basis) and retention
-- columns to core.pii_map so PII registrations can declare both at the
-- platform layer rather than only via the existing free-form `notes` field.
--
-- DEVAI-side note: sense-data-handling currently reads legal_basis/retention
-- from data-model.json column metadata, but sense-data-model does not extract
-- them from migrations or pii_map inserts. Filed as D-A-13 for the next
-- devai alignment session. Until D-A-13 closes, this enrichment is a stynx
-- runtime/compliance improvement, not yet a sensor-visible signal.

ALTER TABLE core.pii_map
  ADD COLUMN IF NOT EXISTS legal_basis text,
  ADD COLUMN IF NOT EXISTS retention   text;

COMMENT ON COLUMN core.pii_map.legal_basis IS
  'LGPD Art. 7 / GDPR Art. 6 lawful basis. Examples: contract, consent, legal_obligation, legitimate_interest, vital_interests, public_task. Free-form to allow per-jurisdiction nuance.';

COMMENT ON COLUMN core.pii_map.retention IS
  'Retention policy expressed as ISO-8601 duration or qualitative tag. Examples: P3Y (3 years), session, on_request_erasure, until_account_closure.';
