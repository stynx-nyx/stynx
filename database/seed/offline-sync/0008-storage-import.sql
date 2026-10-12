-- Import receipts and archived ACK classifications are operator evidence.
-- Bootstrap checks the installed forward chain and never invents history.
-- Run after offline migrations 0001 through 0008, as the configured owner.
DO $$
DECLARE expected text;
BEGIN
  FOREACH expected IN ARRAY ARRAY[
    'numbering_ranges','numbering_reservations','numbering_reservation_scopes',
    'sync_queue_items','sync_conflicts','sync_batches','sync_batch_transport_keys',
    'sync_item_receipts','sync_item_attempts','numbering_consumption',
    'sync_conflict_evidence','sync_conflict_actions','sync_import_receipts'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='offline' AND c.relname=expected
         AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'offline seed requires complete 0008 storage with FORCE RLS: %',expected;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='offline' AND c.relname='sync_batches'
       AND a.attname='response_body_is_archived' AND a.attnotnull
       AND a.atttypid='boolean'::regtype AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'offline seed requires the owner-controlled 0008 archive marker';
  END IF;
END $$;
