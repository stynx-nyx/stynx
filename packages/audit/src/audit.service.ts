import * as auditLogReads from './audit-log-read.repository.js';
import { auditPartitions, auditChainRows } from './audit.repository.js';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, executeConfiguredQuery } from '@stynx-nyx/data';
import { planAuditDetach } from './retention.js';
import {
  STYNX_AUDIT_ARCHIVE_STORE,
  STYNX_AUDIT_CLOCK,
  STYNX_AUDIT_DUMP_RUNNER,
  STYNX_AUDIT_OPTIONS,
  type AuditArchiveStore,
  type AuditClock,
  type AuditDumpRunner,
} from './tokens.js';
import type {
  AuditDetachPlan,
  AuditLogItem,
  AuditLogPage,
  AuditLogQuery,
  ChainVerificationResult,
  StynxAuditModuleOptions,
} from './types.js';



interface AuditChainRow {
  event_id: string;
  occurred_at_text: string | null;
  tenancy_id_text: string | null;
  actor_id_text: string | null;
  entity: string | null;
  entity_id: string | null;
  operation_text: string | null;
  old_data_text: string | null;
  new_data_text: string | null;
  previous_hash: string | null;
  row_hash: string;
}

function cursorField(value: unknown, key: 'occurredAt' | 'id'): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${String(value)} (reading '${key}')`);
  }
  const boxed: unknown = Object(value);
  if (typeof boxed === 'object' && boxed !== null) {
    const field: unknown = Reflect.get(boxed, key);
    return field;
  }
  throw new TypeError('Unable to read cursor property');
}

@Injectable()
export class StynxAuditService {
  private readonly logger = new Logger(StynxAuditService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(STYNX_AUDIT_OPTIONS)
    private readonly options: StynxAuditModuleOptions,
    @Inject(STYNX_AUDIT_CLOCK)
    private readonly clock: AuditClock,
    @Optional()
    @Inject(STYNX_AUDIT_DUMP_RUNNER)
    private readonly dumpRunner?: AuditDumpRunner | null,
    @Optional()
    @Inject(STYNX_AUDIT_ARCHIVE_STORE)
    private readonly archiveStore?: AuditArchiveStore | null,
  ) {}

  async listLog(query: AuditLogQuery = {}): Promise<AuditLogPage> {
    const database = this.requireDatabase();
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

    return database.withSystemContext('platform audit log read', async () =>
      database.tx(async (trx) => {
// BEGIN GENERATED audit-remaining512 service-dispatch
        let mask = 0;
        let tenantId: string | undefined;
        if (query.tenantId) {
          mask |= 1;
          tenantId = query.tenantId;
        }
        let actorId: string | undefined;
        if (query.actorId) {
          mask |= 2;
          actorId = query.actorId;
        }
        let tableSchema: string | undefined;
        if (query.tableSchema) {
          mask |= 4;
          tableSchema = query.tableSchema;
        }
        let tableName: string | undefined;
        if (query.tableName) {
          mask |= 8;
          tableName = query.tableName;
        }
        let rowId: string | undefined;
        if (query.rowId) {
          mask |= 16;
          rowId = query.rowId;
        }
        let from: string | undefined;
        if (query.from) {
          mask |= 32;
          from = query.from;
        }
        let to: string | undefined;
        if (query.to) {
          mask |= 64;
          to = query.to;
        }
        let cursorOccurredAt: unknown;
        let cursorId: unknown;
        if (cursor) {
          mask |= 128;
          cursorOccurredAt = cursorField(cursor, 'occurredAt');
          cursorId = cursorField(cursor, 'id');
        }
        const rows = await (async () => {
          switch (mask) {
            case 0: return trx.run(auditLogReads.auditLogRead0, [limit + 1]);
            case 1: return trx.run(auditLogReads.auditLogRead1, [tenantId, limit + 1]);
            case 2: return trx.run(auditLogReads.auditLogRead2, [actorId, limit + 1]);
            case 3: return trx.run(auditLogReads.auditLogRead3, [tenantId, actorId, limit + 1]);
            case 4: return trx.run(auditLogReads.auditLogRead4, [tableSchema, limit + 1]);
            case 5: return trx.run(auditLogReads.auditLogRead5, [tenantId, tableSchema, limit + 1]);
            case 6: return trx.run(auditLogReads.auditLogRead6, [actorId, tableSchema, limit + 1]);
            case 7: return trx.run(auditLogReads.auditLogRead7, [tenantId, actorId, tableSchema, limit + 1]);
            case 8: return trx.run(auditLogReads.auditLogRead8, [tableName, limit + 1]);
            case 9: return trx.run(auditLogReads.auditLogRead9, [tenantId, tableName, limit + 1]);
            case 10: return trx.run(auditLogReads.auditLogRead10, [actorId, tableName, limit + 1]);
            case 11: return trx.run(auditLogReads.auditLogRead11, [tenantId, actorId, tableName, limit + 1]);
            case 12: return trx.run(auditLogReads.auditLogRead12, [tableSchema, tableName, limit + 1]);
            case 13: return trx.run(auditLogReads.auditLogRead13, [tenantId, tableSchema, tableName, limit + 1]);
            case 14: return trx.run(auditLogReads.auditLogRead14, [actorId, tableSchema, tableName, limit + 1]);
            case 15: return trx.run(auditLogReads.auditLogRead15, [tenantId, actorId, tableSchema, tableName, limit + 1]);
            case 16: return trx.run(auditLogReads.auditLogRead16, [rowId, limit + 1]);
            case 17: return trx.run(auditLogReads.auditLogRead17, [tenantId, rowId, limit + 1]);
            case 18: return trx.run(auditLogReads.auditLogRead18, [actorId, rowId, limit + 1]);
            case 19: return trx.run(auditLogReads.auditLogRead19, [tenantId, actorId, rowId, limit + 1]);
            case 20: return trx.run(auditLogReads.auditLogRead20, [tableSchema, rowId, limit + 1]);
            case 21: return trx.run(auditLogReads.auditLogRead21, [tenantId, tableSchema, rowId, limit + 1]);
            case 22: return trx.run(auditLogReads.auditLogRead22, [actorId, tableSchema, rowId, limit + 1]);
            case 23: return trx.run(auditLogReads.auditLogRead23, [tenantId, actorId, tableSchema, rowId, limit + 1]);
            case 24: return trx.run(auditLogReads.auditLogRead24, [tableName, rowId, limit + 1]);
            case 25: return trx.run(auditLogReads.auditLogRead25, [tenantId, tableName, rowId, limit + 1]);
            case 26: return trx.run(auditLogReads.auditLogRead26, [actorId, tableName, rowId, limit + 1]);
            case 27: return trx.run(auditLogReads.auditLogRead27, [tenantId, actorId, tableName, rowId, limit + 1]);
            case 28: return trx.run(auditLogReads.auditLogRead28, [tableSchema, tableName, rowId, limit + 1]);
            case 29: return trx.run(auditLogReads.auditLogRead29, [tenantId, tableSchema, tableName, rowId, limit + 1]);
            case 30: return trx.run(auditLogReads.auditLogRead30, [actorId, tableSchema, tableName, rowId, limit + 1]);
            case 31: return trx.run(auditLogReads.auditLogRead31, [tenantId, actorId, tableSchema, tableName, rowId, limit + 1]);
            case 32: return trx.run(auditLogReads.auditLogRead32, [from, limit + 1]);
            case 33: return trx.run(auditLogReads.auditLogRead33, [tenantId, from, limit + 1]);
            case 34: return trx.run(auditLogReads.auditLogRead34, [actorId, from, limit + 1]);
            case 35: return trx.run(auditLogReads.auditLogRead35, [tenantId, actorId, from, limit + 1]);
            case 36: return trx.run(auditLogReads.auditLogRead36, [tableSchema, from, limit + 1]);
            case 37: return trx.run(auditLogReads.auditLogRead37, [tenantId, tableSchema, from, limit + 1]);
            case 38: return trx.run(auditLogReads.auditLogRead38, [actorId, tableSchema, from, limit + 1]);
            case 39: return trx.run(auditLogReads.auditLogRead39, [tenantId, actorId, tableSchema, from, limit + 1]);
            case 40: return trx.run(auditLogReads.auditLogRead40, [tableName, from, limit + 1]);
            case 41: return trx.run(auditLogReads.auditLogRead41, [tenantId, tableName, from, limit + 1]);
            case 42: return trx.run(auditLogReads.auditLogRead42, [actorId, tableName, from, limit + 1]);
            case 43: return trx.run(auditLogReads.auditLogRead43, [tenantId, actorId, tableName, from, limit + 1]);
            case 44: return trx.run(auditLogReads.auditLogRead44, [tableSchema, tableName, from, limit + 1]);
            case 45: return trx.run(auditLogReads.auditLogRead45, [tenantId, tableSchema, tableName, from, limit + 1]);
            case 46: return trx.run(auditLogReads.auditLogRead46, [actorId, tableSchema, tableName, from, limit + 1]);
            case 47: return trx.run(auditLogReads.auditLogRead47, [tenantId, actorId, tableSchema, tableName, from, limit + 1]);
            case 48: return trx.run(auditLogReads.auditLogRead48, [rowId, from, limit + 1]);
            case 49: return trx.run(auditLogReads.auditLogRead49, [tenantId, rowId, from, limit + 1]);
            case 50: return trx.run(auditLogReads.auditLogRead50, [actorId, rowId, from, limit + 1]);
            case 51: return trx.run(auditLogReads.auditLogRead51, [tenantId, actorId, rowId, from, limit + 1]);
            case 52: return trx.run(auditLogReads.auditLogRead52, [tableSchema, rowId, from, limit + 1]);
            case 53: return trx.run(auditLogReads.auditLogRead53, [tenantId, tableSchema, rowId, from, limit + 1]);
            case 54: return trx.run(auditLogReads.auditLogRead54, [actorId, tableSchema, rowId, from, limit + 1]);
            case 55: return trx.run(auditLogReads.auditLogRead55, [tenantId, actorId, tableSchema, rowId, from, limit + 1]);
            case 56: return trx.run(auditLogReads.auditLogRead56, [tableName, rowId, from, limit + 1]);
            case 57: return trx.run(auditLogReads.auditLogRead57, [tenantId, tableName, rowId, from, limit + 1]);
            case 58: return trx.run(auditLogReads.auditLogRead58, [actorId, tableName, rowId, from, limit + 1]);
            case 59: return trx.run(auditLogReads.auditLogRead59, [tenantId, actorId, tableName, rowId, from, limit + 1]);
            case 60: return trx.run(auditLogReads.auditLogRead60, [tableSchema, tableName, rowId, from, limit + 1]);
            case 61: return trx.run(auditLogReads.auditLogRead61, [tenantId, tableSchema, tableName, rowId, from, limit + 1]);
            case 62: return trx.run(auditLogReads.auditLogRead62, [actorId, tableSchema, tableName, rowId, from, limit + 1]);
            case 63: return trx.run(auditLogReads.auditLogRead63, [tenantId, actorId, tableSchema, tableName, rowId, from, limit + 1]);
            case 64: return trx.run(auditLogReads.auditLogRead64, [to, limit + 1]);
            case 65: return trx.run(auditLogReads.auditLogRead65, [tenantId, to, limit + 1]);
            case 66: return trx.run(auditLogReads.auditLogRead66, [actorId, to, limit + 1]);
            case 67: return trx.run(auditLogReads.auditLogRead67, [tenantId, actorId, to, limit + 1]);
            case 68: return trx.run(auditLogReads.auditLogRead68, [tableSchema, to, limit + 1]);
            case 69: return trx.run(auditLogReads.auditLogRead69, [tenantId, tableSchema, to, limit + 1]);
            case 70: return trx.run(auditLogReads.auditLogRead70, [actorId, tableSchema, to, limit + 1]);
            case 71: return trx.run(auditLogReads.auditLogRead71, [tenantId, actorId, tableSchema, to, limit + 1]);
            case 72: return trx.run(auditLogReads.auditLogRead72, [tableName, to, limit + 1]);
            case 73: return trx.run(auditLogReads.auditLogRead73, [tenantId, tableName, to, limit + 1]);
            case 74: return trx.run(auditLogReads.auditLogRead74, [actorId, tableName, to, limit + 1]);
            case 75: return trx.run(auditLogReads.auditLogRead75, [tenantId, actorId, tableName, to, limit + 1]);
            case 76: return trx.run(auditLogReads.auditLogRead76, [tableSchema, tableName, to, limit + 1]);
            case 77: return trx.run(auditLogReads.auditLogRead77, [tenantId, tableSchema, tableName, to, limit + 1]);
            case 78: return trx.run(auditLogReads.auditLogRead78, [actorId, tableSchema, tableName, to, limit + 1]);
            case 79: return trx.run(auditLogReads.auditLogRead79, [tenantId, actorId, tableSchema, tableName, to, limit + 1]);
            case 80: return trx.run(auditLogReads.auditLogRead80, [rowId, to, limit + 1]);
            case 81: return trx.run(auditLogReads.auditLogRead81, [tenantId, rowId, to, limit + 1]);
            case 82: return trx.run(auditLogReads.auditLogRead82, [actorId, rowId, to, limit + 1]);
            case 83: return trx.run(auditLogReads.auditLogRead83, [tenantId, actorId, rowId, to, limit + 1]);
            case 84: return trx.run(auditLogReads.auditLogRead84, [tableSchema, rowId, to, limit + 1]);
            case 85: return trx.run(auditLogReads.auditLogRead85, [tenantId, tableSchema, rowId, to, limit + 1]);
            case 86: return trx.run(auditLogReads.auditLogRead86, [actorId, tableSchema, rowId, to, limit + 1]);
            case 87: return trx.run(auditLogReads.auditLogRead87, [tenantId, actorId, tableSchema, rowId, to, limit + 1]);
            case 88: return trx.run(auditLogReads.auditLogRead88, [tableName, rowId, to, limit + 1]);
            case 89: return trx.run(auditLogReads.auditLogRead89, [tenantId, tableName, rowId, to, limit + 1]);
            case 90: return trx.run(auditLogReads.auditLogRead90, [actorId, tableName, rowId, to, limit + 1]);
            case 91: return trx.run(auditLogReads.auditLogRead91, [tenantId, actorId, tableName, rowId, to, limit + 1]);
            case 92: return trx.run(auditLogReads.auditLogRead92, [tableSchema, tableName, rowId, to, limit + 1]);
            case 93: return trx.run(auditLogReads.auditLogRead93, [tenantId, tableSchema, tableName, rowId, to, limit + 1]);
            case 94: return trx.run(auditLogReads.auditLogRead94, [actorId, tableSchema, tableName, rowId, to, limit + 1]);
            case 95: return trx.run(auditLogReads.auditLogRead95, [tenantId, actorId, tableSchema, tableName, rowId, to, limit + 1]);
            case 96: return trx.run(auditLogReads.auditLogRead96, [from, to, limit + 1]);
            case 97: return trx.run(auditLogReads.auditLogRead97, [tenantId, from, to, limit + 1]);
            case 98: return trx.run(auditLogReads.auditLogRead98, [actorId, from, to, limit + 1]);
            case 99: return trx.run(auditLogReads.auditLogRead99, [tenantId, actorId, from, to, limit + 1]);
            case 100: return trx.run(auditLogReads.auditLogRead100, [tableSchema, from, to, limit + 1]);
            case 101: return trx.run(auditLogReads.auditLogRead101, [tenantId, tableSchema, from, to, limit + 1]);
            case 102: return trx.run(auditLogReads.auditLogRead102, [actorId, tableSchema, from, to, limit + 1]);
            case 103: return trx.run(auditLogReads.auditLogRead103, [tenantId, actorId, tableSchema, from, to, limit + 1]);
            case 104: return trx.run(auditLogReads.auditLogRead104, [tableName, from, to, limit + 1]);
            case 105: return trx.run(auditLogReads.auditLogRead105, [tenantId, tableName, from, to, limit + 1]);
            case 106: return trx.run(auditLogReads.auditLogRead106, [actorId, tableName, from, to, limit + 1]);
            case 107: return trx.run(auditLogReads.auditLogRead107, [tenantId, actorId, tableName, from, to, limit + 1]);
            case 108: return trx.run(auditLogReads.auditLogRead108, [tableSchema, tableName, from, to, limit + 1]);
            case 109: return trx.run(auditLogReads.auditLogRead109, [tenantId, tableSchema, tableName, from, to, limit + 1]);
            case 110: return trx.run(auditLogReads.auditLogRead110, [actorId, tableSchema, tableName, from, to, limit + 1]);
            case 111: return trx.run(auditLogReads.auditLogRead111, [tenantId, actorId, tableSchema, tableName, from, to, limit + 1]);
            case 112: return trx.run(auditLogReads.auditLogRead112, [rowId, from, to, limit + 1]);
            case 113: return trx.run(auditLogReads.auditLogRead113, [tenantId, rowId, from, to, limit + 1]);
            case 114: return trx.run(auditLogReads.auditLogRead114, [actorId, rowId, from, to, limit + 1]);
            case 115: return trx.run(auditLogReads.auditLogRead115, [tenantId, actorId, rowId, from, to, limit + 1]);
            case 116: return trx.run(auditLogReads.auditLogRead116, [tableSchema, rowId, from, to, limit + 1]);
            case 117: return trx.run(auditLogReads.auditLogRead117, [tenantId, tableSchema, rowId, from, to, limit + 1]);
            case 118: return trx.run(auditLogReads.auditLogRead118, [actorId, tableSchema, rowId, from, to, limit + 1]);
            case 119: return trx.run(auditLogReads.auditLogRead119, [tenantId, actorId, tableSchema, rowId, from, to, limit + 1]);
            case 120: return trx.run(auditLogReads.auditLogRead120, [tableName, rowId, from, to, limit + 1]);
            case 121: return trx.run(auditLogReads.auditLogRead121, [tenantId, tableName, rowId, from, to, limit + 1]);
            case 122: return trx.run(auditLogReads.auditLogRead122, [actorId, tableName, rowId, from, to, limit + 1]);
            case 123: return trx.run(auditLogReads.auditLogRead123, [tenantId, actorId, tableName, rowId, from, to, limit + 1]);
            case 124: return trx.run(auditLogReads.auditLogRead124, [tableSchema, tableName, rowId, from, to, limit + 1]);
            case 125: return trx.run(auditLogReads.auditLogRead125, [tenantId, tableSchema, tableName, rowId, from, to, limit + 1]);
            case 126: return trx.run(auditLogReads.auditLogRead126, [actorId, tableSchema, tableName, rowId, from, to, limit + 1]);
            case 127: return trx.run(auditLogReads.auditLogRead127, [tenantId, actorId, tableSchema, tableName, rowId, from, to, limit + 1]);
            case 128: return trx.run(auditLogReads.auditLogRead128, [cursorOccurredAt, cursorId, limit + 1]);
            case 129: return trx.run(auditLogReads.auditLogRead129, [tenantId, cursorOccurredAt, cursorId, limit + 1]);
            case 130: return trx.run(auditLogReads.auditLogRead130, [actorId, cursorOccurredAt, cursorId, limit + 1]);
            case 131: return trx.run(auditLogReads.auditLogRead131, [tenantId, actorId, cursorOccurredAt, cursorId, limit + 1]);
            case 132: return trx.run(auditLogReads.auditLogRead132, [tableSchema, cursorOccurredAt, cursorId, limit + 1]);
            case 133: return trx.run(auditLogReads.auditLogRead133, [tenantId, tableSchema, cursorOccurredAt, cursorId, limit + 1]);
            case 134: return trx.run(auditLogReads.auditLogRead134, [actorId, tableSchema, cursorOccurredAt, cursorId, limit + 1]);
            case 135: return trx.run(auditLogReads.auditLogRead135, [tenantId, actorId, tableSchema, cursorOccurredAt, cursorId, limit + 1]);
            case 136: return trx.run(auditLogReads.auditLogRead136, [tableName, cursorOccurredAt, cursorId, limit + 1]);
            case 137: return trx.run(auditLogReads.auditLogRead137, [tenantId, tableName, cursorOccurredAt, cursorId, limit + 1]);
            case 138: return trx.run(auditLogReads.auditLogRead138, [actorId, tableName, cursorOccurredAt, cursorId, limit + 1]);
            case 139: return trx.run(auditLogReads.auditLogRead139, [tenantId, actorId, tableName, cursorOccurredAt, cursorId, limit + 1]);
            case 140: return trx.run(auditLogReads.auditLogRead140, [tableSchema, tableName, cursorOccurredAt, cursorId, limit + 1]);
            case 141: return trx.run(auditLogReads.auditLogRead141, [tenantId, tableSchema, tableName, cursorOccurredAt, cursorId, limit + 1]);
            case 142: return trx.run(auditLogReads.auditLogRead142, [actorId, tableSchema, tableName, cursorOccurredAt, cursorId, limit + 1]);
            case 143: return trx.run(auditLogReads.auditLogRead143, [tenantId, actorId, tableSchema, tableName, cursorOccurredAt, cursorId, limit + 1]);
            case 144: return trx.run(auditLogReads.auditLogRead144, [rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 145: return trx.run(auditLogReads.auditLogRead145, [tenantId, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 146: return trx.run(auditLogReads.auditLogRead146, [actorId, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 147: return trx.run(auditLogReads.auditLogRead147, [tenantId, actorId, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 148: return trx.run(auditLogReads.auditLogRead148, [tableSchema, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 149: return trx.run(auditLogReads.auditLogRead149, [tenantId, tableSchema, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 150: return trx.run(auditLogReads.auditLogRead150, [actorId, tableSchema, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 151: return trx.run(auditLogReads.auditLogRead151, [tenantId, actorId, tableSchema, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 152: return trx.run(auditLogReads.auditLogRead152, [tableName, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 153: return trx.run(auditLogReads.auditLogRead153, [tenantId, tableName, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 154: return trx.run(auditLogReads.auditLogRead154, [actorId, tableName, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 155: return trx.run(auditLogReads.auditLogRead155, [tenantId, actorId, tableName, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 156: return trx.run(auditLogReads.auditLogRead156, [tableSchema, tableName, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 157: return trx.run(auditLogReads.auditLogRead157, [tenantId, tableSchema, tableName, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 158: return trx.run(auditLogReads.auditLogRead158, [actorId, tableSchema, tableName, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 159: return trx.run(auditLogReads.auditLogRead159, [tenantId, actorId, tableSchema, tableName, rowId, cursorOccurredAt, cursorId, limit + 1]);
            case 160: return trx.run(auditLogReads.auditLogRead160, [from, cursorOccurredAt, cursorId, limit + 1]);
            case 161: return trx.run(auditLogReads.auditLogRead161, [tenantId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 162: return trx.run(auditLogReads.auditLogRead162, [actorId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 163: return trx.run(auditLogReads.auditLogRead163, [tenantId, actorId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 164: return trx.run(auditLogReads.auditLogRead164, [tableSchema, from, cursorOccurredAt, cursorId, limit + 1]);
            case 165: return trx.run(auditLogReads.auditLogRead165, [tenantId, tableSchema, from, cursorOccurredAt, cursorId, limit + 1]);
            case 166: return trx.run(auditLogReads.auditLogRead166, [actorId, tableSchema, from, cursorOccurredAt, cursorId, limit + 1]);
            case 167: return trx.run(auditLogReads.auditLogRead167, [tenantId, actorId, tableSchema, from, cursorOccurredAt, cursorId, limit + 1]);
            case 168: return trx.run(auditLogReads.auditLogRead168, [tableName, from, cursorOccurredAt, cursorId, limit + 1]);
            case 169: return trx.run(auditLogReads.auditLogRead169, [tenantId, tableName, from, cursorOccurredAt, cursorId, limit + 1]);
            case 170: return trx.run(auditLogReads.auditLogRead170, [actorId, tableName, from, cursorOccurredAt, cursorId, limit + 1]);
            case 171: return trx.run(auditLogReads.auditLogRead171, [tenantId, actorId, tableName, from, cursorOccurredAt, cursorId, limit + 1]);
            case 172: return trx.run(auditLogReads.auditLogRead172, [tableSchema, tableName, from, cursorOccurredAt, cursorId, limit + 1]);
            case 173: return trx.run(auditLogReads.auditLogRead173, [tenantId, tableSchema, tableName, from, cursorOccurredAt, cursorId, limit + 1]);
            case 174: return trx.run(auditLogReads.auditLogRead174, [actorId, tableSchema, tableName, from, cursorOccurredAt, cursorId, limit + 1]);
            case 175: return trx.run(auditLogReads.auditLogRead175, [tenantId, actorId, tableSchema, tableName, from, cursorOccurredAt, cursorId, limit + 1]);
            case 176: return trx.run(auditLogReads.auditLogRead176, [rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 177: return trx.run(auditLogReads.auditLogRead177, [tenantId, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 178: return trx.run(auditLogReads.auditLogRead178, [actorId, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 179: return trx.run(auditLogReads.auditLogRead179, [tenantId, actorId, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 180: return trx.run(auditLogReads.auditLogRead180, [tableSchema, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 181: return trx.run(auditLogReads.auditLogRead181, [tenantId, tableSchema, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 182: return trx.run(auditLogReads.auditLogRead182, [actorId, tableSchema, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 183: return trx.run(auditLogReads.auditLogRead183, [tenantId, actorId, tableSchema, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 184: return trx.run(auditLogReads.auditLogRead184, [tableName, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 185: return trx.run(auditLogReads.auditLogRead185, [tenantId, tableName, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 186: return trx.run(auditLogReads.auditLogRead186, [actorId, tableName, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 187: return trx.run(auditLogReads.auditLogRead187, [tenantId, actorId, tableName, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 188: return trx.run(auditLogReads.auditLogRead188, [tableSchema, tableName, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 189: return trx.run(auditLogReads.auditLogRead189, [tenantId, tableSchema, tableName, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 190: return trx.run(auditLogReads.auditLogRead190, [actorId, tableSchema, tableName, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 191: return trx.run(auditLogReads.auditLogRead191, [tenantId, actorId, tableSchema, tableName, rowId, from, cursorOccurredAt, cursorId, limit + 1]);
            case 192: return trx.run(auditLogReads.auditLogRead192, [to, cursorOccurredAt, cursorId, limit + 1]);
            case 193: return trx.run(auditLogReads.auditLogRead193, [tenantId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 194: return trx.run(auditLogReads.auditLogRead194, [actorId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 195: return trx.run(auditLogReads.auditLogRead195, [tenantId, actorId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 196: return trx.run(auditLogReads.auditLogRead196, [tableSchema, to, cursorOccurredAt, cursorId, limit + 1]);
            case 197: return trx.run(auditLogReads.auditLogRead197, [tenantId, tableSchema, to, cursorOccurredAt, cursorId, limit + 1]);
            case 198: return trx.run(auditLogReads.auditLogRead198, [actorId, tableSchema, to, cursorOccurredAt, cursorId, limit + 1]);
            case 199: return trx.run(auditLogReads.auditLogRead199, [tenantId, actorId, tableSchema, to, cursorOccurredAt, cursorId, limit + 1]);
            case 200: return trx.run(auditLogReads.auditLogRead200, [tableName, to, cursorOccurredAt, cursorId, limit + 1]);
            case 201: return trx.run(auditLogReads.auditLogRead201, [tenantId, tableName, to, cursorOccurredAt, cursorId, limit + 1]);
            case 202: return trx.run(auditLogReads.auditLogRead202, [actorId, tableName, to, cursorOccurredAt, cursorId, limit + 1]);
            case 203: return trx.run(auditLogReads.auditLogRead203, [tenantId, actorId, tableName, to, cursorOccurredAt, cursorId, limit + 1]);
            case 204: return trx.run(auditLogReads.auditLogRead204, [tableSchema, tableName, to, cursorOccurredAt, cursorId, limit + 1]);
            case 205: return trx.run(auditLogReads.auditLogRead205, [tenantId, tableSchema, tableName, to, cursorOccurredAt, cursorId, limit + 1]);
            case 206: return trx.run(auditLogReads.auditLogRead206, [actorId, tableSchema, tableName, to, cursorOccurredAt, cursorId, limit + 1]);
            case 207: return trx.run(auditLogReads.auditLogRead207, [tenantId, actorId, tableSchema, tableName, to, cursorOccurredAt, cursorId, limit + 1]);
            case 208: return trx.run(auditLogReads.auditLogRead208, [rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 209: return trx.run(auditLogReads.auditLogRead209, [tenantId, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 210: return trx.run(auditLogReads.auditLogRead210, [actorId, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 211: return trx.run(auditLogReads.auditLogRead211, [tenantId, actorId, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 212: return trx.run(auditLogReads.auditLogRead212, [tableSchema, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 213: return trx.run(auditLogReads.auditLogRead213, [tenantId, tableSchema, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 214: return trx.run(auditLogReads.auditLogRead214, [actorId, tableSchema, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 215: return trx.run(auditLogReads.auditLogRead215, [tenantId, actorId, tableSchema, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 216: return trx.run(auditLogReads.auditLogRead216, [tableName, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 217: return trx.run(auditLogReads.auditLogRead217, [tenantId, tableName, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 218: return trx.run(auditLogReads.auditLogRead218, [actorId, tableName, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 219: return trx.run(auditLogReads.auditLogRead219, [tenantId, actorId, tableName, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 220: return trx.run(auditLogReads.auditLogRead220, [tableSchema, tableName, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 221: return trx.run(auditLogReads.auditLogRead221, [tenantId, tableSchema, tableName, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 222: return trx.run(auditLogReads.auditLogRead222, [actorId, tableSchema, tableName, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 223: return trx.run(auditLogReads.auditLogRead223, [tenantId, actorId, tableSchema, tableName, rowId, to, cursorOccurredAt, cursorId, limit + 1]);
            case 224: return trx.run(auditLogReads.auditLogRead224, [from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 225: return trx.run(auditLogReads.auditLogRead225, [tenantId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 226: return trx.run(auditLogReads.auditLogRead226, [actorId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 227: return trx.run(auditLogReads.auditLogRead227, [tenantId, actorId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 228: return trx.run(auditLogReads.auditLogRead228, [tableSchema, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 229: return trx.run(auditLogReads.auditLogRead229, [tenantId, tableSchema, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 230: return trx.run(auditLogReads.auditLogRead230, [actorId, tableSchema, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 231: return trx.run(auditLogReads.auditLogRead231, [tenantId, actorId, tableSchema, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 232: return trx.run(auditLogReads.auditLogRead232, [tableName, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 233: return trx.run(auditLogReads.auditLogRead233, [tenantId, tableName, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 234: return trx.run(auditLogReads.auditLogRead234, [actorId, tableName, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 235: return trx.run(auditLogReads.auditLogRead235, [tenantId, actorId, tableName, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 236: return trx.run(auditLogReads.auditLogRead236, [tableSchema, tableName, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 237: return trx.run(auditLogReads.auditLogRead237, [tenantId, tableSchema, tableName, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 238: return trx.run(auditLogReads.auditLogRead238, [actorId, tableSchema, tableName, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 239: return trx.run(auditLogReads.auditLogRead239, [tenantId, actorId, tableSchema, tableName, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 240: return trx.run(auditLogReads.auditLogRead240, [rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 241: return trx.run(auditLogReads.auditLogRead241, [tenantId, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 242: return trx.run(auditLogReads.auditLogRead242, [actorId, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 243: return trx.run(auditLogReads.auditLogRead243, [tenantId, actorId, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 244: return trx.run(auditLogReads.auditLogRead244, [tableSchema, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 245: return trx.run(auditLogReads.auditLogRead245, [tenantId, tableSchema, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 246: return trx.run(auditLogReads.auditLogRead246, [actorId, tableSchema, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 247: return trx.run(auditLogReads.auditLogRead247, [tenantId, actorId, tableSchema, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 248: return trx.run(auditLogReads.auditLogRead248, [tableName, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 249: return trx.run(auditLogReads.auditLogRead249, [tenantId, tableName, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 250: return trx.run(auditLogReads.auditLogRead250, [actorId, tableName, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 251: return trx.run(auditLogReads.auditLogRead251, [tenantId, actorId, tableName, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 252: return trx.run(auditLogReads.auditLogRead252, [tableSchema, tableName, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 253: return trx.run(auditLogReads.auditLogRead253, [tenantId, tableSchema, tableName, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 254: return trx.run(auditLogReads.auditLogRead254, [actorId, tableSchema, tableName, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            case 255: return trx.run(auditLogReads.auditLogRead255, [tenantId, actorId, tableSchema, tableName, rowId, from, to, cursorOccurredAt, cursorId, limit + 1]);
            default: throw new TypeError('Unknown audit log filter mask');
          }
        })();
// END GENERATED audit-remaining512 service-dispatch

        const items = rows.slice(0, limit).map((row) => this.mapLogRow(row));
        const tail = rows[limit];
        return {
          items,
          ...(tail
            ? {
                nextCursor: this.encodeCursor({
                  occurredAt: this.toIso(tail.occurred_at),
                  id: Number(tail.id),
                }),
              }
            : {}),
        };
      }, { role: 'owner' }),
    );
  }

  async dryRunDetachEligible(now = this.clock.now()): Promise<AuditDetachPlan[]> {
    const database = this.requireDatabase();
    return database.withSystemContext('audit detach dry-run', async () =>
      database.tx(async (trx) => {
        const partitions = await trx.run(auditPartitions, [],
        );

        const plans: AuditDetachPlan[] = [];
        for (const row of partitions) {
          const month = this.partitionMonth(row.partition_name);
          if (!month) {
            continue;
          }
          const keepLonger = await executeConfiguredQuery(trx, 'audit.partition-retention', { partition: row.partition_name }, []);
          const plan = planAuditDetach(
            {
              partitionName: row.partition_name,
              month,
              containsLgpdRetentionTags: Boolean(keepLonger.rows[0]?.keep_longer),
            },
            now,
            this.options.keyPrefix ?? 'audit',
          );
          if (plan) {
            plans.push(plan);
          }
        }

        return plans;
      }, { role: 'owner' }),
    );
  }

  async detachEligible(now = this.clock.now()): Promise<AuditDetachPlan[]> {
    const plans = await this.dryRunDetachEligible(now);
    if (plans.length === 0) {
      return [];
    }
    if (!this.options.bucket || !this.dumpRunner || !this.archiveStore) {
      throw new Error('Audit detach requires bucket, dump runner, and archive store');
    }
    const dumpRunner = this.dumpRunner;
    const archiveStore = this.archiveStore;
    const bucket = this.options.bucket;

    const database = this.requireDatabase();
    await database.withSystemContext('audit detach execution', async () =>
      database.tx(async (trx) => {
        for (const plan of plans) {
          const dumpPath = join(tmpdir(), `${plan.partitionName}.sql.gz`);
          try {
            await dumpRunner.dumpPartition({
              schema: 'audit',
              table: plan.partitionName,
              destinationPath: dumpPath,
            });
            await archiveStore.uploadFile({
              bucket,
              key: plan.objectKey,
              path: dumpPath,
              contentType: 'application/gzip',
            });
            await executeConfiguredQuery(trx, 'audit.partition-detach', { partition: plan.partitionName }, []);
            await executeConfiguredQuery(trx, 'audit.partition-drop', { partition: plan.partitionName }, []);
          } finally {
            await rm(dumpPath, { force: true }).catch(() => undefined);
          }
        }
      }, { role: 'owner' }),
    );
    return plans;
  }

  async runDailyDetachJob(): Promise<void> {
    const detached = await this.detachEligible();
    if (detached.length > 0) {
      this.logger.log(`Detached ${detached.length} audit partition(s)`);
    }
  }

  async verifyChain(tenancyId: string, limit = 1000): Promise<ChainVerificationResult> {
    const database = this.requireDatabase();
    const sanitizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 10_000);

    return database.withSystemContext('audit hash-chain verification', async () =>
      database.tx(async (trx) => {
        const rows = await trx.run(auditChainRows,
          [tenancyId, sanitizedLimit],
        );

        let previousExpectedHash: string | null = null;
        let previousEventId: string | null = null;
        let totalChecked = 0;

        for (const row of rows) {
          totalChecked += 1;

          if (!previousEventId && row.previous_hash !== null) {
            return {
              valid: false,
              totalChecked,
              firstBrokenEventId: row.event_id,
            };
          }

          if (previousEventId && row.previous_hash !== previousExpectedHash) {
            return {
              valid: false,
              totalChecked,
              firstBrokenEventId: previousEventId,
            };
          }

          const expectedHash = this.hashAuditEventRow(row);
          if (expectedHash !== row.row_hash) {
            return {
              valid: false,
              totalChecked,
              firstBrokenEventId: row.event_id,
            };
          }

          previousExpectedHash = expectedHash;
          previousEventId = row.event_id;
        }

        return { valid: true, totalChecked };
      }, { role: 'owner', readonly: true }),
    );
  }

  private mapLogRow(row: auditLogReads.AuditLogReadRow): AuditLogItem {
    return {
      id: Number(row.id),
      occurredAt: this.toIso(row.occurred_at),
      tableSchema: row.table_schema,
      tableName: row.table_name,
      rowId: row.row_id,
      operation: row.operation,
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      requestId: row.request_id,
      sessionId: row.session_id,
      tags: row.tags ?? {},
      payload: row.payload ?? {},
    };
  }

  private requireDatabase(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to StynxAuditService');
    }
    return database;
  }

  private decodeCursor(raw: string): unknown {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  }

  private encodeCursor(cursor: { occurredAt: string | number; id: number }): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private toIso(value: string | Date | number): string | number {
    return value instanceof Date ? value.toISOString() : value;
  }

  private hashAuditEventRow(row: AuditChainRow): string {
    const payload = [
      row.event_id,
      row.occurred_at_text ?? '',
      row.tenancy_id_text ?? '',
      row.actor_id_text ?? '',
      row.entity ?? '',
      row.entity_id ?? '',
      row.operation_text ?? '',
      row.old_data_text ?? '',
      row.new_data_text ?? '',
      row.previous_hash ?? 'GENESIS',
    ].join('|');
    return createHash('sha256').update(payload).digest('hex');
  }

  private partitionMonth(partitionName: string): string | null {
    const match = /^log_(\d{4})_(\d{2})$/.exec(partitionName);
    if (!match?.[1] || !match[2]) {
      return null;
    }
    return `${match[1]}-${match[2]}`;
  }


}
