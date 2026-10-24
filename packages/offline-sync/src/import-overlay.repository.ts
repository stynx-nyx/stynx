import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';
import { finiteNumberingRanges, finiteNumberingReservations, finiteSyncQueueItems, finiteSyncConflicts, finiteSyncBatches, finiteSyncBatchTransportKeys, finiteSyncItemReceipts, finiteSyncItemAttempts, finiteNumberingConsumption, finiteSyncConflictEvidence, finiteSyncConflictActions, finiteNumberingReconciliations, inspectInvariantFindings, inspectRangeCreationEvidence, inspectReconciliationEvidence, inspectReservationScopes, inspectImportLedger, inspectArchivedResponses } from './storage-invariants.repository.js';

const overlayParams = z.tuple([z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string()]);
export type OfflineImportOverlayParams = z.input<typeof overlayParams>;

export const overlayFiniteNumberingRanges = defineQuery({
  name: 'offline.overlayFiniteNumberingRanges',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_numbering_ranges"
        where (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) or (cancelled_at is not null and not isfinite(cancelled_at)) group by tenant_id`,
  params: overlayParams, row: finiteNumberingRanges.row, expects: 'many',
});

export const overlayFiniteNumberingReservations = defineQuery({
  name: 'offline.overlayFiniteNumberingReservations',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_numbering_reservations"
        where (reserved_at is not null and not isfinite(reserved_at)) or (valid_until is not null and not isfinite(valid_until)) or (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: overlayParams, row: finiteNumberingReservations.row, expects: 'many',
});

export const overlayFiniteSyncQueueItems = defineQuery({
  name: 'offline.overlayFiniteSyncQueueItems',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_sync_queue_items"
        where (created_locally_at is not null and not isfinite(created_locally_at)) or (received_at is not null and not isfinite(received_at)) or (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: overlayParams, row: finiteSyncQueueItems.row, expects: 'many',
});

export const overlayFiniteSyncConflicts = defineQuery({
  name: 'offline.overlayFiniteSyncConflicts',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_sync_conflicts"
        where (resolved_at is not null and not isfinite(resolved_at)) or (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: overlayParams, row: finiteSyncConflicts.row, expects: 'many',
});

export const overlayFiniteSyncBatches = defineQuery({
  name: 'offline.overlayFiniteSyncBatches',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_sync_batches"
        where (lease_expires_at is not null and not isfinite(lease_expires_at)) or (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: overlayParams, row: finiteSyncBatches.row, expects: 'many',
});

export const overlayFiniteSyncBatchTransportKeys = defineQuery({
  name: 'offline.overlayFiniteSyncBatchTransportKeys',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_sync_batch_transport_keys"
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: overlayParams, row: finiteSyncBatchTransportKeys.row, expects: 'many',
});

export const overlayFiniteSyncItemReceipts = defineQuery({
  name: 'offline.overlayFiniteSyncItemReceipts',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_sync_item_receipts"
        where (received_at is not null and not isfinite(received_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: overlayParams, row: finiteSyncItemReceipts.row, expects: 'many',
});

export const overlayFiniteSyncItemAttempts = defineQuery({
  name: 'offline.overlayFiniteSyncItemAttempts',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_sync_item_attempts"
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: overlayParams, row: finiteSyncItemAttempts.row, expects: 'many',
});

export const overlayFiniteNumberingConsumption = defineQuery({
  name: 'offline.overlayFiniteNumberingConsumption',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_numbering_consumption"
        where (finalized_at is not null and not isfinite(finalized_at)) group by tenant_id`,
  params: overlayParams, row: finiteNumberingConsumption.row, expects: 'many',
});

export const overlayFiniteSyncConflictEvidence = defineQuery({
  name: 'offline.overlayFiniteSyncConflictEvidence',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_sync_conflict_evidence"
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: overlayParams, row: finiteSyncConflictEvidence.row, expects: 'many',
});

export const overlayFiniteSyncConflictActions = defineQuery({
  name: 'offline.overlayFiniteSyncConflictActions',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_sync_conflict_actions"
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: overlayParams, row: finiteSyncConflictActions.row, expects: 'many',
});

export const overlayFiniteNumberingReconciliations = defineQuery({
  name: 'offline.overlayFiniteNumberingReconciliations',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text as "tenantId",count(*)::text as count from "stynx_import_view_numbering_reconciliations"
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: overlayParams, row: finiteNumberingReconciliations.row, expects: 'many',
});

export const overlayInspectInvariantFindings = defineQuery({
  name: 'offline.overlayInspectInvariantFindings',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming),invalid as (
      select tenant_id,'range-safe-counter'::text as finding from "stynx_import_view_numbering_ranges"
       where start_number < -9007199254740991 or end_number >= 9007199254740991
          or next_number > 9007199254740991 or start_number > end_number
          or next_number < start_number or next_number::numeric > end_number::numeric+1
      union all
      select r.tenant_id,'reservation-range-agreement' from "stynx_import_view_numbering_reservations" r
       join "stynx_import_view_numbering_ranges" n on n.tenant_id=r.tenant_id and n.id=r.range_id
       where r.org_unit_id<>n.org_unit_id or r.entity_type<>n.entity_type or r.series<>n.series
          or r.start_number<n.start_number or r.end_number>n.end_number or r.start_number>r.end_number
          or r.next_number<r.start_number or r.next_number::numeric>r.end_number::numeric+1
          or (r.status<>'cancelled' and n.next_number<=r.end_number)
      union all
      select a.tenant_id,'reservation-overlap' from "stynx_import_view_numbering_reservations" a
       join "stynx_import_view_numbering_reservations" b on a.tenant_id=b.tenant_id and a.range_id=b.range_id and a.id<b.id
       where a.status<>'cancelled' and b.status<>'cancelled'
         and a.start_number<=b.end_number and b.start_number<=a.end_number
      union all
      select tenant_id,'active-reservation-scope' from "stynx_import_view_numbering_reservations"
       where status in ('reserved','blocked') and valid_until>statement_timestamp()
       group by tenant_id,device_id,nullif(shift_id,'stynx:no-shift')
       having count(*)>1 and bool_or(reservation_origin='ctg9')
      union all
      select r.tenant_id,'missing-active-scope-fence' from "stynx_import_view_numbering_reservations" r
       where r.reservation_origin='ctg9' and r.status in ('reserved','blocked')
         and r.valid_until>statement_timestamp() and not exists (
           select 1 from "stynx_import_view_numbering_reservation_scopes" s where s.tenant_id=r.tenant_id
             and s.device_id=r.device_id and s.shift_scope=jsonb_build_array(nullif(r.shift_id,'stynx:no-shift'))::text)
      union all
      select c.tenant_id,'consumption-bounds' from "stynx_import_view_numbering_consumption" c
       join "stynx_import_view_numbering_reservations" r on c.tenant_id=r.tenant_id and c.reservation_id=r.id
       join "stynx_import_view_numbering_ranges" n on n.tenant_id=r.tenant_id and n.id=r.range_id
       where c.number<r.start_number or c.number>r.end_number
         or c.number < -9007199254740991 or c.number > 9007199254740991
         or (c.status in ('claimed-locally','applied') and n.next_number<=c.number)
      union all
      select a.tenant_id,'consumption-reissue' from "stynx_import_view_numbering_consumption" a
       join "stynx_import_view_numbering_reservations" ar on ar.tenant_id=a.tenant_id and ar.id=a.reservation_id
       join "stynx_import_view_numbering_consumption" b on b.tenant_id=a.tenant_id and b.number=a.number and b.reservation_id>a.reservation_id
       join "stynx_import_view_numbering_reservations" br on br.tenant_id=b.tenant_id and br.id=b.reservation_id
       where ar.range_id=br.range_id and a.status in ('claimed-locally','applied') and b.status in ('claimed-locally','applied')
      union all
      select c.tenant_id,'reservation-reissues-protected-number' from "stynx_import_view_numbering_consumption" c
       join "stynx_import_view_numbering_reservations" original on original.tenant_id=c.tenant_id and original.id=c.reservation_id
       join "stynx_import_view_numbering_reservations" reusable on reusable.tenant_id=original.tenant_id
         and reusable.range_id=original.range_id and reusable.id<>original.id
       where c.status in ('claimed-locally','applied') and reusable.status<>'cancelled'
         and c.number between reusable.start_number and reusable.end_number
      union all
      select r.tenant_id,'canonical-receipt-identity' from "stynx_import_view_sync_item_receipts" r
       left join "stynx_import_view_sync_queue_items" q on q.tenant_id=r.tenant_id and q.id=r.queue_item_id
       where q.id is null or q.idempotency_key<>r.idempotency_key or q.payload_hash<>r.payload_hash
          or q.device_id<>r.device_id or q.device_batch_id<>r.device_batch_id
          or (q.identity_mode='ctg9' and q.status<>r.status)
      union all
      select q.tenant_id,'queue-receipt-identity' from "stynx_import_view_sync_queue_items" q
       where q.identity_mode='ctg9' and not exists(select 1 from "stynx_import_view_sync_item_receipts" r where r.tenant_id=q.tenant_id
         and r.queue_item_id=q.id and r.idempotency_key=q.idempotency_key and r.payload_hash=q.payload_hash)
      union all
      select q.tenant_id,'queue-number-precision' from "stynx_import_view_sync_queue_items" q
       where q.reserved_number < -9007199254740991 or q.reserved_number > 9007199254740991
      union all
      select c.tenant_id,'conflict-canonical-identity' from "stynx_import_view_sync_conflicts" c
       join "stynx_import_view_sync_queue_items" q on q.tenant_id=c.tenant_id and q.id=c.sync_queue_item_id
       where c.payload_hash<>q.payload_hash or c.local_entity_id<>q.local_entity_id
      union all
      select e.tenant_id,'conflict-evidence-identity' from "stynx_import_view_sync_conflict_evidence" e
       join "stynx_import_view_sync_conflicts" c on c.tenant_id=e.tenant_id and c.id=e.conflict_id
       where e.queue_item_id<>c.sync_queue_item_id or not exists (select 1 from "stynx_import_view_sync_queue_items" q
         where q.tenant_id=e.tenant_id and q.id=e.queue_item_id)
      union all
      select b.tenant_id,'batch-transport-identity' from "stynx_import_view_sync_batches" b
       where (b.transport_key is null)<>(b.transport_fingerprint is null) or
         (b.transport_key is not null and not exists(select 1 from "stynx_import_view_sync_batch_transport_keys" t
           where t.tenant_id=b.tenant_id and t.transport_key=b.transport_key and t.device_id=b.device_id
             and t.device_batch_id=b.device_batch_id and t.transport_fingerprint=b.transport_fingerprint))
      union all
      select b.tenant_id,'batch-response-state' from "stynx_import_view_sync_batches" b
       where (b.status='closed' and (b.response_status is distinct from 201 or b.response_body_bytes is null
          or b.lease_token is not null or b.lease_expires_at is not null))
         or (b.status='open' and (b.response_status is not null or b.response_body_bytes is not null))
         or ((b.lease_token is null)<>(b.lease_expires_at is null)) or b.lease_generation<0
      union all
      select b.tenant_id,'batch-sequence-precision' from "stynx_import_view_sync_batches" b
       where b.batch_sequence is not null and (b.batch_sequence<1 or b.batch_sequence>9007199254740991)
      union all
      select b.tenant_id,'batch-declared-keys' from "stynx_import_view_sync_batches" b
       where jsonb_typeof(b.declared_keys)<>'array'
      union all
      select r.tenant_id,'range-administration-provenance' from "stynx_import_view_numbering_ranges" r
       where (r.creation_key is not null and (r.created_by is null or r.creation_receipt is null
          or r.creation_fingerprint is null or jsonb_typeof(r.creation_receipt)<>'object'))
         or (r.creation_key is not null and r.status='cancelled' and (r.cancelled_by is null or r.cancelled_at is null))
    ) select tenant_id::text as "tenantId",finding,count(*)::text as count from invalid
      group by tenant_id,finding order by tenant_id,finding`,
  params: overlayParams, row: inspectInvariantFindings.row, expects: 'many',
});

export const overlayInspectRangeCreationEvidence = defineQuery({
  name: 'offline.overlayInspectRangeCreationEvidence',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select id::text,tenant_id::text,org_unit_id,entity_type,series,start_number::text,end_number::text,
      consumer_attributes,created_by,creation_key,creation_fingerprint,creation_receipt,
      (extract(epoch from created_at)*1000000)::numeric(30,0)::text as created_us
      from "stynx_import_view_numbering_ranges" where creation_key is not null`,
  params: overlayParams, row: inspectRangeCreationEvidence.row, expects: 'many',
});

export const overlayInspectReconciliationEvidence = defineQuery({
  name: 'offline.overlayInspectReconciliationEvidence',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select h.id::text,h.tenant_id::text,h.reservation_id::text,h.actor_id,
      to_char(h.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      h.claimed_numbers,h.user_ref,h.idempotency_key,h.request_fingerprint,h.result_json,
      r.start_number::text,r.end_number::text from "stynx_import_view_numbering_reconciliations" h
      left join "stynx_import_view_numbering_reservations" r on r.tenant_id=h.tenant_id and r.id=h.reservation_id`,
  params: overlayParams, row: inspectReconciliationEvidence.row, expects: 'many',
});

export const overlayInspectReservationScopes = defineQuery({
  name: 'offline.overlayInspectReservationScopes',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text,shift_scope from "stynx_import_view_numbering_reservation_scopes"`,
  params: overlayParams, row: inspectReservationScopes.row, expects: 'many',
});

export const overlayInspectImportLedger = defineQuery({
  name: 'offline.overlayInspectImportLedger',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,
      original_manifest,imported_by,(extract(epoch from imported_at)*1000000)::numeric(30,0)::text as imported_us,receipt
      from "stynx_import_view_sync_import_receipts"`,
  params: overlayParams, row: inspectImportLedger.row, expects: 'many',
});

export const overlayInspectArchivedResponses = defineQuery({
  name: 'offline.overlayInspectArchivedResponses',
  text: sql`with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming) select tenant_id::text,device_id,device_batch_id,response_body_bytes,response_headers
      from "stynx_import_view_sync_batches" where response_body_is_archived`,
  params: overlayParams, row: inspectArchivedResponses.row, expects: 'many',
});

export const overlayFiniteInstantQueries = [
  overlayFiniteNumberingRanges,
  overlayFiniteNumberingReservations,
  overlayFiniteSyncQueueItems,
  overlayFiniteSyncConflicts,
  overlayFiniteSyncBatches,
  overlayFiniteSyncBatchTransportKeys,
  overlayFiniteSyncItemReceipts,
  overlayFiniteSyncItemAttempts,
  overlayFiniteNumberingConsumption,
  overlayFiniteSyncConflictEvidence,
  overlayFiniteSyncConflictActions,
  overlayFiniteNumberingReconciliations,
];
