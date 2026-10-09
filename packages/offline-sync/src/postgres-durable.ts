import { createHash, randomUUID } from 'node:crypto';
import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import { Database, IndependentTransactionConnectionError, type Transaction } from '@stynx-nyx/data';
import type {
  CTG9SubmitSyncBatchInput, CTG9SubmitSyncBatchResult, DurableBatchExecutionOptions,
  SyncBatchReceipt, SyncItemReceipt, TrustedOfflineSyncScope,
  NumberingConsumptionResult, NumberingConsumptionEntry, CTG9NumberingReservation,
  CancelNumberingReservationInput, ReconcileNumberingInput, ReconcileNumberingResult,
  SettleNumberingInput,
} from './types';
import { OfflineSyncConfigurationError, OfflineSyncError, OfflineSyncNumberingOutcome, OfflineSyncUpgradeRequiredError } from './errors';
import { applyReplayResponse, batchContextFingerprint, captureReplayableHeaders, transportCompositeKey, transportFingerprint } from './transport';
import { canonicalPayloadHash } from './listing';

interface BatchRow {
  device_id: string; device_batch_id: string; batch_sequence: string | null; status: SyncBatchReceipt['status'];
  context_hash: string; declared_keys: (string | null)[]; lease_token: string | null; lease_generation: string;
  lease_expires_at: Date | string | null; response_status: number | null; response_body_bytes: Buffer | null;
  response_headers: Record<string,string>; transport_key: string | null; transport_fingerprint: string | null;
  lease_valid?: boolean;
}
interface ReceiptRow { idempotency_key: string; queue_item_id: string; payload_hash: string; status: SyncItemReceipt['status']; error_code: string | null; context_json: Record<string,unknown> | null }
interface ReservationRow { id: string; tenant_id: string; range_id: string; org_unit_id: string; entity_type: string; series: string; agent_id: string; device_id: string; shift_id: string; start_number: string; end_number: string; next_number: string; valid_until: Date | string; status: CTG9NumberingReservation['status']; expired?: boolean }
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const failure = (code: 'OFFLINE_SYNC_BATCH_CONFLICT' | 'OFFLINE_SYNC_BATCH_SEQUENCE', status: number, message: string): never => { throw new OfflineSyncError(code,status,message); };
const mapReservation = (r: ReservationRow): CTG9NumberingReservation => ({ reservationId:r.id,rangeId:r.range_id,tenantId:r.tenant_id,orgUnitId:r.org_unit_id,entityType:r.entity_type,series:r.series,agentId:r.agent_id,deviceId:r.device_id,shiftId:r.shift_id,startNumber:Number(r.start_number),endNumber:Number(r.end_number),nextNumber:Number(r.next_number),validUntil:new Date(r.valid_until).toISOString(),status:r.status });
const reservationSelect = `select id,tenant_id,range_id,org_unit_id,entity_type,series,agent_id,device_id,shift_id,start_number,end_number,next_number,valid_until,status,(valid_until <= clock_timestamp()) as expired from offline.numbering_reservations where tenant_id=$1::uuid and id=$2::uuid`;
function assertIndependent(database: Database): void { if (database.hasHeldConnection()) throw new IndependentTransactionConnectionError(); }
function upgrade(error: unknown): never { const code = (error as {code?:string}).code; if (code === '42703' || code === '42P01') throw new OfflineSyncUpgradeRequiredError(); throw error; }
async function txDurable<T>(database: Database, fn: (trx: Transaction) => Promise<T>): Promise<T> {
  try { return await database.tx(fn); } catch (error) { upgrade(error); }
}
async function readBatch(trx: Transaction, scope: TrustedOfflineSyncScope, input: CTG9SubmitSyncBatchInput): Promise<BatchRow | null> {
  const rows = await trx.query<BatchRow>(`select *,lease_expires_at > clock_timestamp() as lease_valid from offline.sync_batches where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3`,[scope.tenantId,input.deviceId,input.deviceBatchId]);
  return rows.rows[0] ?? null;
}
async function renewLease(trx: Transaction, scope: TrustedOfflineSyncScope, input: CTG9SubmitSyncBatchInput, token: string, generation: number): Promise<void> {
  const held = await trx.query(`update offline.sync_batches set lease_expires_at=clock_timestamp()+interval '30 seconds'
    where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and status='open'
      and lease_token=$4::uuid and lease_generation=$5 returning lease_generation`,
    [scope.tenantId,input.deviceId,input.deviceBatchId,token,generation]);
  if (!held.rowCount) failure('OFFLINE_SYNC_BATCH_CONFLICT',409,'Batch lease was fenced.');
}
function rowReceipt(row: BatchRow, items: SyncItemReceipt[]): SyncBatchReceipt {
  return {deviceId:row.device_id,deviceBatchId:row.device_batch_id,batchSequence:row.batch_sequence === null ? null : Number(row.batch_sequence),status:row.status,items,responseStatus:row.response_status,responseBodyBytes:row.response_body_bytes,responseHeaders:row.response_headers ?? {}};
}
function verifyBatchIdentity(row: BatchRow, input: CTG9SubmitSyncBatchInput, contextHash: string, compositeKey: string, fingerprint: string): void {
  if (row.status === 'legacy_closed_unverified') return;
  if (row.context_hash !== contextHash ||
      (row.batch_sequence === null ? null : Number(row.batch_sequence)) !== (input.batchSequence ?? null) ||
      JSON.stringify(row.declared_keys) !== JSON.stringify(input.items.map(item => item.idempotencyKey ?? null)))
    failure('OFFLINE_SYNC_BATCH_CONFLICT',409,'Batch context differs.');
  if (row.transport_key === compositeKey && row.transport_fingerprint !== null && row.transport_fingerprint !== fingerprint)
    throw new UnprocessableEntityException('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
}
async function bindTransportKey(trx: Transaction, scope: TrustedOfflineSyncScope, input: CTG9SubmitSyncBatchInput, compositeKey: string, fingerprint: string): Promise<void> {
  await trx.query(`insert into offline.sync_batch_transport_keys
    (tenant_id,transport_key,device_id,device_batch_id,transport_fingerprint)
    values ($1::uuid,$2,$3,$4,$5) on conflict (tenant_id,transport_key) do nothing`,
    [scope.tenantId,compositeKey,input.deviceId,input.deviceBatchId,fingerprint]);
  const bound = (await trx.query<{device_id:string;device_batch_id:string;transport_fingerprint:string}>(
    `select device_id,device_batch_id,transport_fingerprint from offline.sync_batch_transport_keys
      where tenant_id=$1::uuid and transport_key=$2`,[scope.tenantId,compositeKey])).rows[0];
  if (bound?.transport_fingerprint !== fingerprint)
    throw new UnprocessableEntityException('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
  if (bound.device_id !== input.deviceId || bound.device_batch_id !== input.deviceBatchId)
    failure('OFFLINE_SYNC_BATCH_CONFLICT',409,'Transport key belongs to another batch.');
}
async function itemReceipts(trx: Transaction, scope: TrustedOfflineSyncScope, input: CTG9SubmitSyncBatchInput): Promise<SyncItemReceipt[]> {
  const rows = await trx.query<{queue_item_id:string;status:SyncItemReceipt['status'];error_code:string|null;context_json:Record<string,unknown>|null}>(
    `select queue_item_id,status,error_code,context_json,received_at as event_at
      from offline.sync_item_receipts where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
     union all
     select queue_item_id,status,error_code,context_json,created_at as event_at
      from offline.sync_item_attempts where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
     order by event_at,queue_item_id`,[scope.tenantId,input.deviceId,input.deviceBatchId]);
  return rows.rows.map(r => ({queueItemId:r.queue_item_id,status:r.status,...(r.error_code ? {errorCode:r.error_code} : {}),...(r.context_json ? {context:r.context_json} : {})}));
}
export async function pgGetBatch(database: Database, scope: TrustedOfflineSyncScope, deviceId: string, deviceBatchId: string): Promise<SyncBatchReceipt | null> {
  return txDurable(database,async trx => {
    const input = {deviceId,deviceBatchId} as CTG9SubmitSyncBatchInput;
    const row = await readBatch(trx,scope,input);
    return row ? rowReceipt(row,await itemReceipts(trx,scope,input)) : null;
  });
}
export async function pgGetItem(database: Database, scope: TrustedOfflineSyncScope, key: string): Promise<SyncItemReceipt | null> {
  return txDurable(database,async trx => {
    const r = (await trx.query<ReceiptRow>(`select idempotency_key,queue_item_id,payload_hash,status,error_code,context_json from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2`,[scope.tenantId,key])).rows[0];
    return r ? {queueItemId:r.queue_item_id,status:r.status,...(r.error_code ? {errorCode:r.error_code} : {}),...(r.context_json ? {context:r.context_json} : {})} : null;
  });
}
export async function pgTransition(database: Database, scope: TrustedOfflineSyncScope, id: string, status: CTG9NumberingReservation['status'], input: CancelNumberingReservationInput | SettleNumberingInput, now: string, action: 'block' | 'close' | 'settle'): Promise<CTG9NumberingReservation> {
  return txDurable(database,async trx => {
    const r = (await trx.query<ReservationRow>(`${reservationSelect} for update`,[scope.tenantId,id])).rows[0];
    if (!r) throw new OfflineSyncError('OFFLINE_SYNC_RESERVATION_NOT_FOUND',404,'Reservation was not found.');
    if (r.status === status && action !== 'settle') return mapReservation(r);
    if (!['reserved','expired'].includes(r.status) && !(action === 'settle' && r.status === 'consumed')) throw new OfflineSyncError('OFFLINE_SYNC_RESERVATION_STATE',409,'Reservation cannot transition.');
    const userRef = action === 'settle' ? (input as SettleNumberingInput).userRef ?? null : null;
    const updated = (await trx.query<ReservationRow>(`update offline.numbering_reservations set status=$3,audit_actor_id=$4,
      updated_at=$5::timestamptz,settlement_action=$6,settlement_reason=$7,settlement_user_ref=$8,settled_by=$4
      where tenant_id=$1::uuid and id=$2::uuid returning *`,[scope.tenantId,id,status,scope.actorId,now,action,input.reason ?? null,userRef])).rows[0]!;
    if (status === 'blocked') await trx.query(`update offline.numbering_consumption set status='blocked' where tenant_id=$1::uuid and reservation_id=$2::uuid and status='available'`,[scope.tenantId,id]);
    if (status === 'consumed') await trx.query(`update offline.numbering_consumption set status='expired' where tenant_id=$1::uuid and reservation_id=$2::uuid and status='available'`,[scope.tenantId,id]);
    return mapReservation(updated);
  });
}
export async function pgConsumption(database: Database, scope: TrustedOfflineSyncScope, id: string): Promise<NumberingConsumptionResult> {
  return txDurable(database,async trx => {
    const r = (await trx.query<ReservationRow>(reservationSelect,[scope.tenantId,id])).rows[0];
    if (!r) throw new OfflineSyncError('OFFLINE_SYNC_RESERVATION_NOT_FOUND',404,'Reservation was not found.');
    const rows = await trx.query<{number:string;status:NumberingConsumptionEntry['status'];server_entity_id:string|null;finalized_at:Date|string|null}>(`select number,status,server_entity_id,finalized_at from offline.numbering_consumption where tenant_id=$1::uuid and reservation_id=$2::uuid`,[scope.tenantId,id]);
    const overrides = new Map(rows.rows.map(e => [Number(e.number),e]));
    const consumption: NumberingConsumptionEntry[] = [];
    for (let number=Number(r.start_number);number<=Number(r.end_number);number+=1) {
      const entry = overrides.get(number);
      const fallback: NumberingConsumptionEntry['status'] = r.status === 'blocked' ? 'blocked' : (r.status === 'expired' || r.expired || r.status === 'cancelled' || r.status === 'consumed') ? 'expired' : 'available';
      const status = entry?.status === 'available' && fallback !== 'available' ? fallback : entry?.status ?? fallback;
      consumption.push({number,status,serverEntityId:entry?.server_entity_id ?? null,finalizedAt:entry?.finalized_at ? new Date(entry.finalized_at).toISOString() : null});
    }
    return {reservationId:id,status:r.status,consumption};
  });
}
export async function pgReconcile(database: Database, scope: TrustedOfflineSyncScope, id: string, input: ReconcileNumberingInput, now: string): Promise<ReconcileNumberingResult> {
  const initial = await pgConsumption(database,scope,id);
  const claims = new Set(input.claimedNumbers ?? []);
  if ([...claims].some(n => !initial.consumption.some(e => e.number === n))) throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT',400,'Claim is outside reservation.');
  await txDurable(database,async trx => {
    const reservation = (await trx.query<{status:string}>(`select status from offline.numbering_reservations
      where tenant_id=$1::uuid and id=$2::uuid for update`,[scope.tenantId,id])).rows[0];
    if (!reservation) throw new OfflineSyncError('OFFLINE_SYNC_RESERVATION_NOT_FOUND',404,'Reservation was not found.');
    if (reservation.status !== 'reserved') return;
    for (const number of claims) await trx.query(`insert into offline.numbering_consumption
      (tenant_id,reservation_id,number,status) values ($1::uuid,$2::uuid,$3,'claimed-locally')
      on conflict (tenant_id,reservation_id,number) do update
        set status=case when offline.numbering_consumption.status='available' then 'claimed-locally' else offline.numbering_consumption.status end`,
      [scope.tenantId,id,number]);
    await trx.query(`update offline.numbering_reservations set audit_actor_id=$3,
      updated_at=$4::timestamptz where tenant_id=$1::uuid and id=$2::uuid`,[scope.tenantId,id,scope.actorId,now]);
  });
  const result = await pgConsumption(database,scope,id);
  return {...result,missingOnServer:result.consumption.filter(e => claims.has(e.number) && e.status !== 'applied').map(e => e.number),unexpectedOnServer:result.consumption.filter(e => !claims.has(e.number) && e.status === 'applied').map(e => e.number)};
}

export async function pgSubmit(database: Database, scope: TrustedOfflineSyncScope, input: CTG9SubmitSyncBatchInput, options: DurableBatchExecutionOptions, now: string): Promise<CTG9SubmitSyncBatchResult> {
  assertIndependent(database);
  const itemKeys = new Map<string,string>();
  const declaredKeys = new Set<string>();
  for (const item of input.items) {
    if (item.reservedNumber !== undefined && !Number.isSafeInteger(item.reservedNumber))
      throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT',400,'reservedNumber must be a safe integer.');
    if (item.idempotencyKey?.startsWith('stynx:legacy:')) throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT',400,'Reserved item namespace.');
    let key = item.idempotencyKey;
    if (!key) {
      const identity = options.ports.legacyItemIdentityResolver ? await options.ports.legacyItemIdentityResolver.resolve({tenantId:scope.tenantId,deviceId:input.deviceId,deviceBatchId:input.deviceBatchId,queueItemId:item.queueItemId,localEntityId:item.localEntityId,entityType:item.entityType}) : [input.deviceId,input.deviceBatchId,item.queueItemId].join('\0');
      if (!identity) throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT',400,'Legacy identity is empty.');
      key=`stynx:legacy:v1:${sha(`${scope.tenantId}\0${identity}`)}`;
    }
    if (declaredKeys.has(key)) throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT',400,'Item identity appears more than once in the batch.');
    declaredKeys.add(key);
    itemKeys.set(item.queueItemId,key);
  }
  if (!options.ports.itemApplier && input.items.some(item => item.idempotencyKey && item.reservedNumber !== undefined))
    throw new OfflineSyncConfigurationError('itemApplier');
  if (options.ports.itemApplier && !options.ports.eventPort)
    throw new OfflineSyncConfigurationError('eventPort');
  const contextHash = batchContextFingerprint(input,options.agentId);
  const fingerprint = transportFingerprint(options.transport,input);
  const compositeKey = transportCompositeKey(scope,options.transport);
  const token = randomUUID();
  let acquired = false;
  let row: BatchRow;
  try {
    row = await txDurable(database,async trx => {
      await trx.query(`set local lock_timeout = '100ms'`);
      await trx.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`,[`${scope.tenantId}:${input.deviceId}`]);
      const existing = await readBatch(trx,scope,input);
      if (existing) {
        verifyBatchIdentity(existing,input,contextHash,compositeKey,fingerprint);
        if (existing.status !== 'legacy_closed_unverified') await bindTransportKey(trx,scope,input,compositeKey,fingerprint);
        if (existing.status === 'legacy_closed_unverified') await trx.query(`insert into offline.sync_item_receipts
          (tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,received_at)
          select tenant_id,idempotency_key,id,device_id,device_batch_id,payload_hash,status,received_at
          from offline.sync_queue_items where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
            and identity_mode='e6' on conflict (tenant_id,idempotency_key) do nothing`,
          [scope.tenantId,input.deviceId,input.deviceBatchId]);
        if (existing.status === 'closed' || existing.status === 'legacy_closed_unverified') return existing;
        if (existing.lease_token && existing.lease_valid) return existing;
        const taken = (await trx.query<BatchRow>(`update offline.sync_batches set lease_token=$4::uuid,lease_generation=lease_generation+1,lease_expires_at=clock_timestamp()+interval '30 seconds' where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and (lease_token is null or lease_expires_at <= clock_timestamp()) returning *`,[scope.tenantId,input.deviceId,input.deviceBatchId,token])).rows[0];
        if (!taken) return existing;
        acquired = true;
        return taken;
      }
      const e6Items = await trx.query<{id:string;idempotency_key:string}>(
        `select id,idempotency_key from offline.sync_queue_items where tenant_id=$1::uuid
          and device_id=$2 and device_batch_id=$3 and identity_mode='e6' order by id collate "C"`,
        [scope.tenantId,input.deviceId,input.deviceBatchId],
      );
      if (e6Items.rows.length) {
        const legacy = (await trx.query<BatchRow>(`insert into offline.sync_batches
          (tenant_id,device_id,device_batch_id,org_unit_id,agent_id,context_hash,declared_keys,status)
          values ($1::uuid,$2,$3,$4,$5,'legacy-unverified',$6::jsonb,'legacy_closed_unverified')
          returning *`,[scope.tenantId,input.deviceId,input.deviceBatchId,input.orgUnitId,options.agentId,JSON.stringify(e6Items.rows.map(r => r.idempotency_key))])).rows[0]!;
        await trx.query(`insert into offline.sync_item_receipts
          (tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,received_at)
          select tenant_id,idempotency_key,id,device_id,device_batch_id,payload_hash,status,received_at
          from offline.sync_queue_items where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
            and identity_mode='e6' on conflict (tenant_id,idempotency_key) do nothing`,
          [scope.tenantId,input.deviceId,input.deviceBatchId]);
        return legacy;
      }
      if (input.batchSequence != null) {
        const sequences = await trx.query<{batch_sequence:string}>(`select batch_sequence from offline.sync_batches where tenant_id=$1::uuid and device_id=$2 and batch_sequence is not null order by batch_sequence desc limit 1 for update`,[scope.tenantId,input.deviceId]);
        const expected = Number(sequences.rows[0]?.batch_sequence ?? 0)+1;
        if (input.batchSequence < expected) failure('OFFLINE_SYNC_BATCH_CONFLICT',409,'Batch sequence already used.');
        if (input.batchSequence > expected) failure('OFFLINE_SYNC_BATCH_SEQUENCE',422,`Expected batch sequence ${expected}; received ${input.batchSequence}.`);
      }
      const inserted = (await trx.query<BatchRow>(`insert into offline.sync_batches (tenant_id,device_id,device_batch_id,org_unit_id,agent_id,batch_sequence,context_hash,declared_keys,status,lease_token,lease_generation,lease_expires_at,transport_key,transport_fingerprint) values ($1::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb,'open',$9::uuid,1,clock_timestamp()+interval '30 seconds',$10,$11) returning *`,[scope.tenantId,input.deviceId,input.deviceBatchId,input.orgUnitId,options.agentId,input.batchSequence ?? null,contextHash,JSON.stringify(input.items.map(i => i.idempotencyKey ?? null)),token,compositeKey,fingerprint])).rows[0]!;
      await bindTransportKey(trx,scope,input,compositeKey,fingerprint);
      acquired = true;
      return inserted;
    });
  } catch (error) {
    if ((error as {code?:string}).code !== '55P03') upgrade(error);
    row = await txDurable(database,async trx => {
      const contested = await readBatch(trx,scope,input);
      if (!contested) return null;
      verifyBatchIdentity(contested,input,contextHash,compositeKey,fingerprint);
      if (contested.status !== 'legacy_closed_unverified') await bindTransportKey(trx,scope,input,compositeKey,fingerprint);
      return contested;
    }) as BatchRow;
    if (!row) throw new OfflineSyncError('OFFLINE_SYNC:BATCH:in-progress',503,'Batch is in progress.',true);
  }
  if (row.status === 'legacy_closed_unverified') {
    const legacyItems = await txDurable(database,async trx => (await trx.query<{id:string;entity_type:string;local_entity_id:string;idempotency_key:string;payload_hash:string}>(
      `select id,entity_type,local_entity_id,idempotency_key,payload_hash from offline.sync_queue_items
       where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 order by id collate "C"`,
      [scope.tenantId,input.deviceId,input.deviceBatchId],
    )).rows);
    const declared = [...input.items].map(item => ({id:item.queueItemId,entity_type:item.entityType,local_entity_id:item.localEntityId,idempotency_key:item.idempotencyKey ?? '',payload_hash:item.payloadHash})).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (JSON.stringify(legacyItems) !== JSON.stringify(declared)) failure('OFFLINE_SYNC_BATCH_CONFLICT',409,'Legacy batch context differs.');
    const legacy = options.ports.legacyIdempotencyStore;
    if (!legacy) throw new OfflineSyncError('OFFLINE_SYNC_BATCH_CONFLICT',409,'Legacy batch ACK cannot be verified.');
    const routeKey = `${options.transport.method}:${options.transport.path}`;
    const transportUserId = options.transport.transportUserId === undefined ? scope.actorId : options.transport.transportUserId;
    const decision = {request: {method:options.transport.method,url:options.transport.path,body:options.transport.requestBody ?? input,headers:{}},compositeKey,headerName:'Idempotency-Key',headerValue:options.transport.transportIdempotencyKey,requestFingerprint:fingerprint,tenantId:scope.tenantId,...(transportUserId === null ? {} : {userId:transportUserId}),routeKey,ttlMs:86_400_000};
    const entry = await legacy.lookup(decision);
    if (!entry || entry.status !== 'completed' || entry.requestFingerprint !== fingerprint || entry.expiresAt <= Date.now() || entry.body === undefined || entry.statusCode === null) throw new OfflineSyncError('OFFLINE_SYNC_BATCH_CONFLICT',409,'Legacy batch ACK cannot be verified.');
    applyReplayResponse(options.transport,options.ports,entry.statusCode,entry.headers);
    return entry.body as CTG9SubmitSyncBatchResult;
  }
  if (row.status === 'closed') { applyReplayResponse(options.transport,options.ports,row.response_status ?? 201,row.response_headers); return JSON.parse(Buffer.from(row.response_body_bytes ?? '').toString('utf8')) as CTG9SubmitSyncBatchResult; }
  if (!acquired) {
    const deadline = Date.now()+(options.ports.leaseWaitMs ?? 750);
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve,50));
      const current = await pgGetBatch(database,scope,input.deviceId,input.deviceBatchId);
      if (current?.status === 'closed' && current.responseBodyBytes) { applyReplayResponse(options.transport,options.ports,current.responseStatus ?? 201,current.responseHeaders); return JSON.parse(Buffer.from(current.responseBodyBytes).toString('utf8')) as CTG9SubmitSyncBatchResult; }
      const taken = await txDurable(database,async trx => {
        await trx.query(`set local lock_timeout = '100ms'`);
        return (await trx.query<BatchRow>(`update offline.sync_batches set lease_token=$4::uuid,
          lease_generation=lease_generation+1,lease_expires_at=clock_timestamp()+interval '30 seconds'
          where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and status='open'
            and (lease_token is null or lease_expires_at <= clock_timestamp()) returning *`,
          [scope.tenantId,input.deviceId,input.deviceBatchId,token])).rows[0] ?? null;
      }).catch(error => { if ((error as {code?:string}).code === '55P03') return null; throw error; });
      if (taken) { row=taken; acquired=true; break; }
    }
    if (!acquired) throw new OfflineSyncError('OFFLINE_SYNC:BATCH:in-progress',503,'Batch is in progress.',true);
  }
  const generation = Number(row.lease_generation);
  try {
  const results: CTG9SubmitSyncBatchResult['items'][number][] = [];
  const receipts: SyncItemReceipt[] = [];
  let duplicates=0;
  let retryable=false;
  for (const item of input.items) {
    const key = itemKeys.get(item.queueItemId)!;
    const preflight = await txDurable(database,async trx => {
      await renewLease(trx,scope,input,token,generation);
      await trx.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`,[`${scope.tenantId}:${key}`]);
      if (!canonicalPayloadHash.test(item.payloadHash)) {
        // ADR-MOBILE-OFFLINE-0003 D4: a non-canonical hash is diverted here, before any statement a
        // CHECK could reject. Only the attempt row records the received value; no queue row, item
        // receipt, consumption or effect exists, so the key stays unconsumed. When the key already has
        // an original, the D3 item 6 integrity conflict row is deferred to the next patch.
        await trx.query(`insert into offline.sync_item_attempts
          (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code)
          values ($1::uuid,$2,$3,$4,$5,$6,'rejected','OFFLINE_SYNC_ITEM_INTEGRITY')
          on conflict (tenant_id,device_id,device_batch_id,queue_item_id) do nothing`,
          [scope.tenantId,input.deviceId,input.deviceBatchId,item.queueItemId,key,item.payloadHash]);
        return {kind:'non-canonical' as const,receipt:{queue_item_id:item.queueItemId,status:'rejected' as const,error_code:'OFFLINE_SYNC_ITEM_INTEGRITY',payload_hash:item.payloadHash}};
      }
      await trx.query(`insert into offline.sync_queue_items
        (id,tenant_id,device_batch_id,org_unit_id,agent_id,device_id,entity_type,local_entity_id,
         idempotency_key,payload_hash,payload_json,reserved_number,status,created_locally_at,received_at,identity_mode)
        values ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,'received',$13::timestamptz,$14::timestamptz,'ctg9')
        on conflict do nothing`,[item.queueItemId,scope.tenantId,input.deviceBatchId,input.orgUnitId,options.agentId,
          input.deviceId,item.entityType,item.localEntityId,key,item.payloadHash,JSON.stringify(item.payloadJson),
          item.reservedNumber ?? null,item.createdLocallyAt,now]);
      const stored = (await trx.query<{id:string;payload_hash:string;identity_mode:string;device_id:string;device_batch_id:string;org_unit_id:string;agent_id:string;status:SyncItemReceipt['status']}>(
        `select id,payload_hash,identity_mode,device_id,device_batch_id,org_unit_id,agent_id,status
         from offline.sync_queue_items where tenant_id=$1::uuid and idempotency_key=$2`,
        [scope.tenantId,key])).rows[0];
      if (!stored) {
        await trx.query(`insert into offline.sync_item_attempts
          (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code)
          values ($1::uuid,$2,$3,$4,$5,$6,'rejected','OFFLINE_SYNC_QUEUE_ID_REUSED')
          on conflict (tenant_id,device_id,device_batch_id,queue_item_id) do nothing`,
          [scope.tenantId,input.deviceId,input.deviceBatchId,item.queueItemId,key,item.payloadHash]);
        return {kind:'queue-reused' as const,receipt:{queue_item_id:item.queueItemId,status:'rejected' as const,error_code:'OFFLINE_SYNC_QUEUE_ID_REUSED',payload_hash:item.payloadHash}};
      }
      if (stored.identity_mode === 'e6') {
        await trx.query(`insert into offline.sync_batches
          (tenant_id,device_id,device_batch_id,org_unit_id,agent_id,context_hash,declared_keys,status)
          values ($1::uuid,$2,$3,$4,$5,'legacy-unverified',$6::jsonb,'legacy_closed_unverified')
          on conflict (tenant_id,device_id,device_batch_id) do nothing`,
          [scope.tenantId,stored.device_id,stored.device_batch_id,stored.org_unit_id,stored.agent_id,JSON.stringify([key])]);
        await trx.query(`insert into offline.sync_item_receipts
          (tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status)
          values ($1::uuid,$2,$3,$4,$5,$6,$7)
          on conflict (tenant_id,idempotency_key) do nothing`,
          [scope.tenantId,key,stored.id,stored.device_id,stored.device_batch_id,stored.payload_hash,stored.status]);
        if (stored.status === 'received' && stored.payload_hash === item.payloadHash) {
          await trx.query(`insert into offline.sync_item_attempts
            (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code)
            values ($1::uuid,$2,$3,$4,$5,$6,'rejected','OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED')
            on conflict (tenant_id,device_id,device_batch_id,queue_item_id) do nothing`,
            [scope.tenantId,input.deviceId,input.deviceBatchId,item.queueItemId,key,item.payloadHash]);
          return {kind:'legacy-received' as const,receipt:{queue_item_id:item.queueItemId,status:'rejected' as const,error_code:'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED',payload_hash:item.payloadHash}};
        }
      }
      const insertedReceipt = await trx.query(`insert into offline.sync_item_receipts
        (tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,error_code)
        values ($1::uuid,$2,$3,$4,$5,$6,'received',$7)
        on conflict (tenant_id,idempotency_key) do nothing returning idempotency_key`,[scope.tenantId,key,item.queueItemId,
          input.deviceId,input.deviceBatchId,item.payloadHash,item.idempotencyKey ? null : 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED']);
      const receipt = (await trx.query<ReceiptRow & {device_id:string;device_batch_id:string}>(
        `select * from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2 for update`,
        [scope.tenantId,key])).rows[0]!;
      if (receipt.payload_hash !== item.payloadHash) {
        await trx.query(`insert into offline.sync_item_attempts
          (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code)
          values ($1::uuid,$2,$3,$4,$5,$6,'rejected','OFFLINE_SYNC_ITEM_INTEGRITY')
          on conflict (tenant_id,device_id,device_batch_id,queue_item_id) do nothing`,
          [scope.tenantId,input.deviceId,input.deviceBatchId,item.queueItemId,key,item.payloadHash]);
        return {kind:'integrity' as const,receipt};
      }
      if (receipt.device_id !== input.deviceId || receipt.device_batch_id !== input.deviceBatchId ||
          receipt.queue_item_id !== item.queueItemId || receipt.status !== 'received' || (!item.idempotencyKey && !insertedReceipt.rowCount)) {
        if (receipt.device_id !== input.deviceId || receipt.device_batch_id !== input.deviceBatchId || receipt.queue_item_id !== item.queueItemId) {
          await trx.query(`insert into offline.sync_item_attempts
            (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code,context_json)
            values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
            on conflict (tenant_id,device_id,device_batch_id,queue_item_id)
            do update set status=excluded.status,error_code=excluded.error_code,context_json=excluded.context_json`,
            [scope.tenantId,input.deviceId,input.deviceBatchId,item.queueItemId,key,item.payloadHash,
              receipt.status,receipt.error_code,JSON.stringify({originalQueueItemId:receipt.queue_item_id})]);
        }
        return {kind:'duplicate' as const,receipt};
      }
      return {kind:'apply' as const,receipt};
    });
    if (preflight.kind !== 'apply') {
      if (preflight.kind === 'legacy-received' || (preflight.kind === 'duplicate' &&
          (preflight.receipt.device_id !== input.deviceId || preflight.receipt.device_batch_id !== input.deviceBatchId)))
        duplicates += 1;
      const status: SyncItemReceipt['status'] = preflight.kind === 'integrity' || preflight.kind === 'non-canonical' || preflight.kind === 'queue-reused' || preflight.kind === 'legacy-received' ? 'rejected' : preflight.receipt.status;
      const errorCode = preflight.kind === 'integrity' ? 'OFFLINE_SYNC_ITEM_INTEGRITY' : preflight.receipt.error_code;
      if (status === 'received' && item.idempotencyKey && options.ports.itemApplier) retryable = true;
      const duplicateContext = preflight.kind === 'duplicate' ? {
        ...(preflight.receipt.context_json ?? {}),
        ...(preflight.receipt.queue_item_id !== item.queueItemId ? {originalQueueItemId:preflight.receipt.queue_item_id} : {}),
      } : null;
      receipts.push({queueItemId:item.queueItemId,
        status,...(errorCode ? {errorCode} : {}),
        ...(duplicateContext && Object.keys(duplicateContext).length ? {context:duplicateContext} : {})});
      results.push({...item,tenantId:scope.tenantId,agentId:options.agentId,orgUnitId:input.orgUnitId,
        deviceId:input.deviceId,status,receivedAt:now,
        ...(errorCode ? {errorCode} : {}),
        ...(duplicateContext && Object.keys(duplicateContext).length ? {context:duplicateContext} : {})});
      continue;
    }
    let status: SyncItemReceipt['status']='received';
    let errorCode: string | undefined = item.idempotencyKey ? undefined : 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED';
    let receiptContext: Record<string,unknown> | undefined;
    const itemApplier = options.ports.itemApplier;
    if (item.idempotencyKey && itemApplier) {
      try {
        const suspected = await database.txIndependent(async trx => {
          await renewLease(trx,scope,input,token,generation);
          const locked = (await trx.query<ReceiptRow & {device_id:string;device_batch_id:string}>(
            `select * from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2 for update`,
            [scope.tenantId,key])).rows[0];
          if (!locked || locked.device_id !== input.deviceId || locked.device_batch_id !== input.deviceBatchId ||
              locked.queue_item_id !== item.queueItemId || locked.payload_hash !== item.payloadHash || locked.status !== 'received')
            return {kind:'duplicate' as const,status:locked?.status ?? 'received'};
          const context = {...scope,agentId:options.agentId,orgUnitId:input.orgUnitId,deviceId:input.deviceId,
            batchId:input.deviceBatchId,now,receiptId:key};
          let reservationId: string | null = null;
          if (item.reservedNumber != null) {
            const covering = (await trx.query<{id:string;status:string;valid_until:Date|string}>(
              `select r.id,r.status,r.valid_until from offline.numbering_reservations r
               where tenant_id=$1::uuid and device_id=$2 and org_unit_id=$3 and entity_type=$4
                 and start_number<=$5 and end_number>=$5
                 and ($6::uuid is null or id=$6::uuid)
                 and (r.status <> 'cancelled' or exists (
                   select 1 from offline.numbering_consumption c where c.tenant_id=r.tenant_id
                     and c.reservation_id=r.id and c.number=$5 and c.status in ('applied','claimed-locally')))
               order by r.id for update of r`,
              [scope.tenantId,input.deviceId,input.orgUnitId,item.entityType,item.reservedNumber,item.reservationId ?? null])).rows;
            if (covering.length === 0) throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_NO_COVERAGE',item.reservedNumber,item.reservationId ?? null);
            if (covering.length > 1) throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_AMBIGUOUS',item.reservedNumber,null);
            const reservation = covering[0]!;
            reservationId = reservation.id;
            const consumed = (await trx.query<{status:string}>(`select status from offline.numbering_consumption
              where tenant_id=$1::uuid and reservation_id=$2::uuid and number=$3 for update`,
              [scope.tenantId,reservationId,item.reservedNumber])).rows[0];
            if (consumed?.status === 'applied') throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED',item.reservedNumber,reservationId);
            if (reservation.status !== 'reserved' || new Date(reservation.valid_until).getTime() < Date.parse(item.createdLocallyAt))
              throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_EXPIRED',item.reservedNumber,reservationId);
            if (consumed && !['available','claimed-locally'].includes(consumed.status))
              throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_EXPIRED',item.reservedNumber,reservationId);
            const claimed = await trx.query(`insert into offline.numbering_consumption
              (tenant_id,reservation_id,number,status) values ($1::uuid,$2::uuid,$3,'claimed-locally')
              on conflict (tenant_id,reservation_id,number) do update set status='claimed-locally'
                where offline.numbering_consumption.status in ('available','claimed-locally')
              returning number`,[scope.tenantId,reservationId,item.reservedNumber]);
            if (!claimed.rowCount) throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED',item.reservedNumber,reservationId);
          }
          const applied = await itemApplier.apply(trx,item,context);
          let concurrencyConflict = false;
          if (options.policy.concurrencyWindowMinutes && options.ports.concurrencyDetector) {
            const detection = await options.ports.concurrencyDetector.detect(trx,item,context);
            if (detection.suspected) for (const pair of detection.pairs) {
              if (await options.ports.handoffPort?.permits(trx,pair,context)) continue;
              for (const affected of new Set([pair.firstItemId,pair.secondItemId])) {
                const conflictId = randomUUID();
                await trx.query(`insert into offline.sync_conflicts
                  (id,tenant_id,sync_queue_item_id,local_entity_id,payload_hash,conflict_type,description,status,created_at)
                  select $3::uuid,tenant_id,id,local_entity_id,payload_hash,'concurrency',
                    'Concurrent agent activity','open',$4::timestamptz
                  from offline.sync_queue_items where tenant_id=$1::uuid and id=$2`,
                  [scope.tenantId,affected,conflictId,now]);
                const allowedActions = await options.ports.conflictResolver?.allowedActions?.(trx,conflictId,context) ?? ['manual-review'];
                await trx.query(`insert into offline.sync_conflict_evidence
                  (tenant_id,conflict_id,queue_item_id,related_queue_item_id,allowed_actions,evidence)
                  values ($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::jsonb)`,
                  [scope.tenantId,conflictId,affected,affected === pair.firstItemId ? pair.secondItemId : pair.firstItemId,
                    JSON.stringify(allowedActions),JSON.stringify({pair,detectedAt:now,concurrencyWindowMinutes:options.policy.concurrencyWindowMinutes})]);
                await trx.query(`update offline.sync_queue_items set status='conflict',updated_at=$3::timestamptz
                  where tenant_id=$1::uuid and id=$2`,[scope.tenantId,affected,now]);
                await trx.query(`update offline.sync_item_receipts set status='conflict',
                  context_json=$3::jsonb,updated_at=$4::timestamptz
                  where tenant_id=$1::uuid and queue_item_id=$2`,[scope.tenantId,affected,
                    JSON.stringify({conflictId,relatedQueueItemId:affected === pair.firstItemId ? pair.secondItemId : pair.firstItemId,allowedActions}),now]);
              }
              if ([pair.firstItemId,pair.secondItemId].includes(item.queueItemId)) concurrencyConflict=true;
            }
          }
          if (reservationId !== null) {
            await trx.query(`update offline.numbering_consumption set status='applied',
              server_entity_id=$4,finalized_at=$5::timestamptz
              where tenant_id=$1::uuid and reservation_id=$2::uuid and number=$3 and status='claimed-locally'`,
              [scope.tenantId,reservationId,item.reservedNumber,applied.serverEntityId,now]);
          }
          if (!concurrencyConflict) {
            await trx.query(`update offline.sync_queue_items set status='applied',updated_at=$3::timestamptz
              where tenant_id=$1::uuid and id=$2`,[scope.tenantId,item.queueItemId,now]);
            await trx.query(`update offline.sync_item_receipts set status='applied',error_code=null,
              updated_at=$3::timestamptz where tenant_id=$1::uuid and idempotency_key=$2`,[scope.tenantId,key,now]);
          }
          await options.ports.eventPort!.appendInTransaction(trx,{entity:item.entityType,
            entityId:applied.serverEntityId,idempotencyKey:key,payload:item.payloadJson});
          return {kind:'applied' as const,conflict:concurrencyConflict};
        },{role:'app',isolation:'read committed',strictItemMode:true});
        if (suspected.kind === 'duplicate') { status=suspected.status; if (status === 'received') retryable=true; }
        else status=suspected.conflict ? 'conflict' : 'applied';
        errorCode=undefined;
      } catch (error) {
        const classified = error instanceof HttpException && error.getStatus() >= 400 && error.getStatus() < 500 &&
          !(error instanceof OfflineSyncError && error.code === 'OFFLINE_SYNC_BATCH_CONFLICT');
        const numbering = error instanceof OfflineSyncNumberingOutcome ? error : null;
        errorCode=(error as {code?:string}).code ?? 'OFFLINE_SYNC_ITEM_FAILED';
        if (numbering) { status=numbering.receiptStatus; receiptContext=numbering.context; }
        else if (classified) status='rejected'; else retryable=true;
        await txDurable(database,async trx => {
          await renewLease(trx,scope,input,token,generation);
          if (numbering) {
            const conflictId = randomUUID();
            const itemContext = {...scope,agentId:options.agentId,orgUnitId:input.orgUnitId,deviceId:input.deviceId,
              batchId:input.deviceBatchId,now,receiptId:key};
            await trx.query(`insert into offline.sync_conflicts
              (id,tenant_id,sync_queue_item_id,local_entity_id,payload_hash,conflict_type,description,status,created_at)
              values ($1::uuid,$2::uuid,$3,$4,$5,'domain',$6,'open',$7::timestamptz)`,
              [conflictId,scope.tenantId,item.queueItemId,item.localEntityId,item.payloadHash,numbering.code,now]);
            const allowedActions = await options.ports.conflictResolver?.allowedActions?.(trx,conflictId,itemContext) ?? ['reject','retry_after_correction'];
            await trx.query(`insert into offline.sync_conflict_evidence
              (tenant_id,conflict_id,queue_item_id,allowed_actions,evidence)
              values ($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb)`,
              [scope.tenantId,conflictId,item.queueItemId,JSON.stringify(allowedActions),
                JSON.stringify({...numbering.context,errorCode:numbering.code,detectedAt:now})]);
            receiptContext={...numbering.context,conflictId,allowedActions};
          }
          await trx.query(`update offline.sync_item_receipts set status=$3,error_code=$4,
            context_json=$8::jsonb,updated_at=$5::timestamptz where tenant_id=$1::uuid and idempotency_key=$2
            and device_id=$6 and device_batch_id=$7 and status='received'`,
            [scope.tenantId,key,status,errorCode,now,input.deviceId,input.deviceBatchId,
              receiptContext ? JSON.stringify(receiptContext) : null]);
          if (classified) await trx.query(`update offline.sync_queue_items set status=$3,
            updated_at=$4::timestamptz where tenant_id=$1::uuid and id=$2`,[scope.tenantId,item.queueItemId,status,now]);
        });
      }
    }
    receipts.push({queueItemId:item.queueItemId,status,...(errorCode ? {errorCode} : {}),
      ...(receiptContext ? {context:receiptContext} : {})});
    results.push({...item,tenantId:scope.tenantId,agentId:options.agentId,orgUnitId:input.orgUnitId,
      deviceId:input.deviceId,status,receivedAt:now,...(errorCode ? {errorCode} : {}),
      ...(receiptContext ? {context:receiptContext} : {})});
  }
  const receipt: SyncBatchReceipt={deviceId:input.deviceId,deviceBatchId:input.deviceBatchId,batchSequence:input.batchSequence ?? null,status:retryable?'open':'closed',items:receipts,responseStatus:retryable?null:201,responseBodyBytes:null,responseHeaders:captureReplayableHeaders(options.transport)};
  const result: CTG9SubmitSyncBatchResult={batchId:input.deviceBatchId,acceptedItems:input.items.length,duplicateItems:duplicates,conflicts:results.filter(i=>i.status==='conflict').map(i=>i.queueItemId),items:results,receipt};
  const bytes = Buffer.from(JSON.stringify(result));
  await txDurable(database,async trx => {
    await renewLease(trx,scope,input,token,generation);
    const updated = await trx.query(`update offline.sync_batches set status=$4,response_status=$5,response_body_bytes=$6,response_headers=$9::jsonb,lease_token=null,lease_expires_at=null,updated_at=$7::timestamptz where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and lease_token=$8::uuid and lease_generation=$10`,[scope.tenantId,input.deviceId,input.deviceBatchId,receipt.status,receipt.responseStatus,retryable?null:bytes,now,token,JSON.stringify(receipt.responseHeaders),generation]);
    if (!updated.rowCount) failure('OFFLINE_SYNC_BATCH_CONFLICT',409,'Batch lease was fenced.');
  });
  return result;
  } catch (error) {
    await txDurable(database,async trx => {
      await trx.query(`update offline.sync_batches set lease_token=null,lease_expires_at=null
        where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
          and lease_token=$4::uuid and lease_generation=$5 and status='open'`,
        [scope.tenantId,input.deviceId,input.deviceBatchId,token,generation]);
    }).catch(() => undefined);
    throw error;
  }
}
