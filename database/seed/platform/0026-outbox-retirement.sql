-- Retirement is operator evidence; bootstrap never fabricates a disposition.
-- Run after the platform migration chain. Reapplication is data-neutral,
-- including on a populated installation that already has retirement receipts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='outbox' AND c.relname='event_retirements'
       AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'outbox retirement seed requires migration 0026 with FORCE RLS';
  END IF;
END $$;
