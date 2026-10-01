-- Forward-only UPS-OFS-05 upgrade. Apply after 0002. Additive: existing rows keep NULL keys and
-- callers that omit ReserveNumberingInput.idempotencyKey never read or write these columns.
-- offline.numbering_reservations keeps its 0001 FORCE RLS policy and 0001 grants (column grants
-- follow the table grants to stynx_app and stynx_reader).
ALTER TABLE offline.numbering_reservations ADD COLUMN idempotency_key text
  CONSTRAINT numbering_reservations_idempotency_key_check
  CHECK (idempotency_key IS NULL OR octet_length(idempotency_key) BETWEEN 1 AND 255);
ALTER TABLE offline.numbering_reservations ADD COLUMN idempotency_fingerprint text;
ALTER TABLE offline.numbering_reservations ADD CONSTRAINT numbering_reservations_idempotency_pair_check
  CHECK ((idempotency_key IS NULL) = (idempotency_fingerprint IS NULL));
CREATE UNIQUE INDEX numbering_reservations_tenant_idempotency_uq
  ON offline.numbering_reservations (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
