-- ADR-OUTBOX-0004: terminal operator disposition with immutable provenance.
-- Historical event, attempt and ACK bytes are preserved.
ALTER TABLE outbox.event_delivery DROP CONSTRAINT event_delivery_status_check;
ALTER TABLE outbox.event_delivery ADD CONSTRAINT event_delivery_status_check
  CHECK (status IN ('PENDING','SENT','SENT_UNRESOLVED','ERROR','ACKED','RETIRED'));

-- @no_soft_delete: retirement receipts are append-only operator evidence.
CREATE TABLE outbox.event_retirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (octet_length(idempotency_key) BETWEEN 1 AND 255),
  actor_id uuid NOT NULL,
  -- Same whitespace set as ECMAScript String.trim(), including Unicode spaces.
  reason text NOT NULL CHECK (
    length(btrim(reason, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0
    AND octet_length(reason) <= 2048),
  previous_status text NOT NULL CHECK (previous_status IN ('PENDING','SENT','SENT_UNRESOLVED','ERROR')),
  retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT outbox_retirements_event_fk FOREIGN KEY (tenant_id,event_id)
    REFERENCES outbox.events(tenant_id,id),
  CONSTRAINT outbox_retirements_operation_key UNIQUE (tenant_id,idempotency_key),
  CONSTRAINT outbox_retirements_event_key UNIQUE (tenant_id,event_id)
);
CREATE OR REPLACE FUNCTION outbox.reject_retirement_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog,outbox AS $$
BEGIN
  RAISE EXCEPTION 'outbox_retirement_immutable' USING ERRCODE='STY43';
END $$;
CREATE TRIGGER outbox_retirements_immutable
  BEFORE UPDATE OR DELETE ON outbox.event_retirements
  FOR EACH ROW EXECUTE FUNCTION outbox.reject_retirement_mutation();
ALTER TABLE outbox.event_retirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.event_retirements FORCE ROW LEVEL SECURITY;
CREATE POLICY retirements_tenant ON outbox.event_retirements TO stynx_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid
    AND actor_id = nullif(current_setting('app.actor_id',true),'')::uuid);
CREATE POLICY retirements_reader ON outbox.event_retirements FOR SELECT TO stynx_reader
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON outbox.event_retirements FROM PUBLIC,stynx_app,stynx_reader;
GRANT SELECT,INSERT ON outbox.event_retirements TO stynx_app;
GRANT SELECT ON outbox.event_retirements TO stynx_reader;
REVOKE ALL ON FUNCTION outbox.reject_retirement_mutation() FROM PUBLIC,stynx_app,stynx_reader;
