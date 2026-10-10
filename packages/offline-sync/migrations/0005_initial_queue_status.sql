-- ADR-MOBILE-OFFLINE-0004 D1: the winning durable batch captures its initial mode.
-- Defaults preserve historical batch context hashes, fingerprints and archived ACK bytes.
ALTER TABLE offline.sync_batches ADD COLUMN initial_queue_status text NOT NULL DEFAULT 'received'
  CHECK (initial_queue_status IN ('received','pending'));
