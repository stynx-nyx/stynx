import { randomUUID } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { Database, type SoftDeletableTable } from '@stynx/data';
import { DocumentsService } from '@stynx/storage';
import { and, desc, eq } from 'drizzle-orm';
import type {
  CompleteDocumentDto,
  CreateDocumentDto,
  CreateRecordDto,
  CreateRecordNoteDto,
  CreateWorkItemDto,
  CreateWorkItemEntryDto,
  CreateWorkItemLockDto,
  ListQuery,
  UpdateRecordDto,
  UpdateRecordNoteDto,
  UpdateWorkItemDto,
  UpdateWorkItemEntryDto,
  UpdateWorkItemLockDto,
} from './dto';
import {
  recordNotes,
  records,
  workItemEntries,
  workItemLocks,
  workItems,
} from './schema';

type SampleTable =
  | typeof records
  | typeof recordNotes
  | typeof workItems
  | typeof workItemEntries
  | typeof workItemLocks;

type ArchiveDeleteConfig = {
  archiveTable: string;
};

const HARD_DELETE_CONFIRMATION = 'I understand this is irrecoverable';

function clampLimit(value?: number): number {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.min(Math.max(Number(value), 1), 200);
}

@Injectable()
export class ReferenceSampleService {
  constructor(
    private readonly database: Database,
    private readonly requestContext: RequestContext,
    private readonly documentsService: DocumentsService,
  ) {}

  async createDocument(input: CreateDocumentDto) {
    return this.documentsService.initiate(input);
  }

  async completeDocument(id: string, input: CompleteDocumentDto) {
    return this.documentsService.complete(id, input);
  }

  async getDocumentDownload(id: string) {
    return this.documentsService.getDownloadUrl(id);
  }

  async softDeleteDocument(id: string) {
    await this.documentsService.softRemove(id);
    return { status: 'soft-deleted', id };
  }

  async restoreDocument(id: string) {
    await this.documentsService.restore(id);
    return { status: 'restored', id };
  }

  async hardDeleteDocument(id: string) {
    await this.documentsService.hardRemove(id);
    return { status: 'hard-deleted', id };
  }

  async listRecords(query: ListQuery = {}) {
    return this.database.tx(
      async (trx) =>
        trx.select().from(records)
          .where(eq(records.tenantId, this.requireTenantId()))
          .orderBy(desc(records.updatedAt))
          .limit(clampLimit(query.limit)),
      { role: 'reader', readonly: true },
    );
  }

  async getRecord(id: string) {
    return this.requireLive(records, id);
  }

  async listDeletedRecords(query: ListQuery = {}) {
    const rows = await this.database.tx(
      async (trx) =>
        trx.select().from(records)
          .onlyDeleted()
          .where(eq(records.tenantId, this.requireTenantId()))
          .orderBy(desc(records.updatedAt))
          .limit(clampLimit(query.limit)),
      { role: 'reader', readonly: true },
    );
    return rows.map((row) => this.serializeForResponse(row));
  }

  async createRecord(input: CreateRecordDto) {
    return this.database.tx(async (trx) => {
      const id = randomUUID();
      const now = new Date();
      await trx.insert(records).values({
        id,
        tenantId: this.requireTenantId(),
        title: input.title,
        email: input.email,
        externalRef: input.externalRef ?? null,
        status: input.status ?? 'active',
        ownerUserId: input.ownerUserId ?? null,
        createdAt: now,
        createdBy: this.requireActorId(),
        updatedAt: now,
        updatedBy: this.requireActorId(),
      });
      return this.requireById(records, id);
    });
  }

  async updateRecord(id: string, input: UpdateRecordDto) {
    return this.database.tx(async (trx) => {
      await this.requireLive(records, id);
      await trx.update(records).set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.externalRef !== undefined ? { externalRef: input.externalRef } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
        updatedAt: new Date(),
        updatedBy: this.requireActorId(),
      }).where(and(eq(records.id, id), eq(records.tenantId, this.requireTenantId())));
      return this.requireById(records, id);
    });
  }

  async softDeleteRecord(id: string) {
    return this.softDelete(records, id);
  }

  async restoreRecord(id: string) {
    return this.restore(records, id);
  }

  async hardDeleteRecord(id: string) {
    return this.hardDelete(id, { archiveTable: 'archive.sample_record' });
  }

  async listRecordNotes(query: ListQuery = {}) {
    return this.database.tx(
      async (trx) =>
        trx.select().from(recordNotes)
          .where(eq(recordNotes.tenantId, this.requireTenantId()))
          .orderBy(desc(recordNotes.updatedAt))
          .limit(clampLimit(query.limit)),
      { role: 'reader', readonly: true },
    );
  }

  async getRecordNote(id: string) {
    return this.requireLive(recordNotes, id);
  }

  async createRecordNote(input: CreateRecordNoteDto) {
    return this.database.tx(async (trx) => {
      const id = randomUUID();
      const now = new Date();
      await trx.insert(recordNotes).values({
        id,
        tenantId: this.requireTenantId(),
        recordId: input.recordId,
        kind: input.kind,
        label: input.label,
        detail: input.detail,
        detail2: input.detail2 ?? null,
        region: input.region,
        code: input.code,
        locale: input.locale ?? 'en',
        createdAt: now,
        createdBy: this.requireActorId(),
        updatedAt: now,
        updatedBy: this.requireActorId(),
      });
      return this.requireById(recordNotes, id);
    });
  }

  async updateRecordNote(id: string, input: UpdateRecordNoteDto) {
    return this.database.tx(async (trx) => {
      await this.requireLive(recordNotes, id);
      await trx.update(recordNotes).set({
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.detail !== undefined ? { detail: input.detail } : {}),
        ...(input.detail2 !== undefined ? { detail2: input.detail2 } : {}),
        ...(input.region !== undefined ? { region: input.region } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        updatedAt: new Date(),
        updatedBy: this.requireActorId(),
      }).where(and(eq(recordNotes.id, id), eq(recordNotes.tenantId, this.requireTenantId())));
      return this.requireById(recordNotes, id);
    });
  }

  async softDeleteRecordNote(id: string) {
    return this.softDelete(recordNotes, id);
  }

  async restoreRecordNote(id: string) {
    return this.restore(recordNotes, id);
  }

  async hardDeleteRecordNote(id: string) {
    return this.hardDelete(id, { archiveTable: 'archive.sample_record_note' });
  }

  async listWorkItems(query: ListQuery = {}) {
    return this.database.tx(
      async (trx) =>
        trx.select().from(workItems)
          .where(eq(workItems.tenantId, this.requireTenantId()))
          .orderBy(desc(workItems.updatedAt))
          .limit(clampLimit(query.limit)),
      { role: 'reader', readonly: true },
    );
  }

  async listDeletedWorkItems(query: ListQuery = {}) {
    const rows = await this.database.tx(
      async (trx) =>
        trx.select().from(workItems)
          .onlyDeleted()
          .where(eq(workItems.tenantId, this.requireTenantId()))
          .orderBy(desc(workItems.updatedAt))
          .limit(clampLimit(query.limit)),
      { role: 'reader', readonly: true },
    );
    return rows.map((row) => this.serializeForResponse(row));
  }

  async getWorkItem(id: string) {
    return this.requireLive(workItems, id);
  }

  async createWorkItem(input: CreateWorkItemDto) {
    return this.database.tx(async (trx) => {
      const id = randomUUID();
      const now = new Date();
      await trx.insert(workItems).values({
        id,
        tenantId: this.requireTenantId(),
        recordId: input.recordId,
        createdByUserId: input.createdByUserId ?? null,
        code: input.code,
        openedOn: input.openedOn,
        targetOn: input.targetOn,
        category: input.category ?? 'GEN',
        totalUnits: input.totalUnits ?? 0,
        status: input.status ?? 'draft',
        createdAt: now,
        createdBy: this.requireActorId(),
        updatedAt: now,
        updatedBy: this.requireActorId(),
      });
      return this.requireById(workItems, id);
    });
  }

  async updateWorkItem(id: string, input: UpdateWorkItemDto) {
    return this.database.tx(async (trx) => {
      await this.requireLive(workItems, id);
      await trx.update(workItems).set({
        ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
        ...(input.createdByUserId !== undefined ? { createdByUserId: input.createdByUserId } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.openedOn !== undefined ? { openedOn: input.openedOn } : {}),
        ...(input.targetOn !== undefined ? { targetOn: input.targetOn } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.totalUnits !== undefined ? { totalUnits: input.totalUnits } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
        updatedBy: this.requireActorId(),
      }).where(and(eq(workItems.id, id), eq(workItems.tenantId, this.requireTenantId())));
      return this.requireById(workItems, id);
    });
  }

  async softDeleteWorkItem(id: string) {
    return this.softDelete(workItems, id);
  }

  async restoreWorkItem(id: string) {
    return this.restore(workItems, id);
  }

  async hardDeleteWorkItem(id: string) {
    return this.hardDelete(id, { archiveTable: 'archive.sample_work_item' });
  }

  async listWorkItemEntries(query: ListQuery = {}) {
    return this.database.tx(
      async (trx) =>
        trx.select().from(workItemEntries)
          .where(eq(workItemEntries.tenantId, this.requireTenantId()))
          .orderBy(desc(workItemEntries.updatedAt))
          .limit(clampLimit(query.limit)),
      { role: 'reader', readonly: true },
    );
  }

  async getWorkItemEntry(id: string) {
    return this.requireLive(workItemEntries, id);
  }

  async createWorkItemEntry(input: CreateWorkItemEntryDto) {
    return this.database.tx(async (trx) => {
      const id = randomUUID();
      const now = new Date();
      await trx.insert(workItemEntries).values({
        id,
        tenantId: this.requireTenantId(),
        workItemId: input.workItemId,
        description: input.description,
        quantity: input.quantity,
        unitUnits: input.unitUnits,
        createdAt: now,
        createdBy: this.requireActorId(),
        updatedAt: now,
        updatedBy: this.requireActorId(),
      });
      return this.requireById(workItemEntries, id);
    });
  }

  async updateWorkItemEntry(id: string, input: UpdateWorkItemEntryDto) {
    return this.database.tx(async (trx) => {
      await this.requireLive(workItemEntries, id);
      await trx.update(workItemEntries).set({
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.unitUnits !== undefined ? { unitUnits: input.unitUnits } : {}),
        updatedAt: new Date(),
        updatedBy: this.requireActorId(),
      }).where(and(eq(workItemEntries.id, id), eq(workItemEntries.tenantId, this.requireTenantId())));
      return this.requireById(workItemEntries, id);
    });
  }

  async softDeleteWorkItemEntry(id: string) {
    return this.softDelete(workItemEntries, id);
  }

  async restoreWorkItemEntry(id: string) {
    return this.restore(workItemEntries, id);
  }

  async hardDeleteWorkItemEntry(id: string) {
    return this.hardDelete(id, { archiveTable: 'archive.sample_work_item_entry' });
  }

  async listWorkItemLocks(query: ListQuery = {}) {
    return this.database.tx(
      async (trx) =>
        trx.select().from(workItemLocks)
          .where(eq(workItemLocks.tenantId, this.requireTenantId()))
          .orderBy(desc(workItemLocks.updatedAt))
          .limit(clampLimit(query.limit)),
      { role: 'reader', readonly: true },
    );
  }

  async getWorkItemLock(id: string) {
    return this.requireLive(workItemLocks, id);
  }

  async createWorkItemLock(input: CreateWorkItemLockDto) {
    return this.database.tx(async (trx) => {
      const id = randomUUID();
      const now = new Date();
      await trx.insert(workItemLocks).values({
        id,
        tenantId: this.requireTenantId(),
        workItemId: input.workItemId,
        lockedAt: new Date(input.lockedAt),
        amountUnits: input.amountUnits,
        reason: input.reason,
        externalRef: input.externalRef ?? null,
        createdAt: now,
        createdBy: this.requireActorId(),
        updatedAt: now,
        updatedBy: this.requireActorId(),
      });
      return this.requireById(workItemLocks, id);
    });
  }

  async updateWorkItemLock(id: string, input: UpdateWorkItemLockDto) {
    return this.database.tx(async (trx) => {
      await this.requireLive(workItemLocks, id);
      await trx.update(workItemLocks).set({
        ...(input.lockedAt !== undefined ? { lockedAt: new Date(input.lockedAt) } : {}),
        ...(input.amountUnits !== undefined ? { amountUnits: input.amountUnits } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.externalRef !== undefined ? { externalRef: input.externalRef } : {}),
        updatedAt: new Date(),
        updatedBy: this.requireActorId(),
      }).where(and(eq(workItemLocks.id, id), eq(workItemLocks.tenantId, this.requireTenantId())));
      return this.requireById(workItemLocks, id);
    });
  }

  async softDeleteWorkItemLock(id: string) {
    return this.softDelete(workItemLocks, id);
  }

  async restoreWorkItemLock(id: string) {
    return this.restore(workItemLocks, id);
  }

  async hardDeleteWorkItemLock(id: string) {
    return this.hardDelete(id, { archiveTable: 'archive.sample_work_item_lock' });
  }

  private async softDelete<T extends SampleTable>(table: SoftDeletableTable<T>, id: string) {
    return this.database.tx(async (trx) => {
      await this.requireLive(table, id);
      const deleted = await trx.softDelete(table, id);
      return this.serializeForResponse({
        ...deleted,
        archiveId: deleted.archiveId.toString(),
      });
    });
  }

  private async restore<T extends SampleTable>(table: SoftDeletableTable<T>, id: string) {
    return this.database.tx(async (trx) => {
      await trx.restoreFromArchive(table, id);
      return this.requireById(table, id);
    });
  }

  private async hardDelete(id: string, config: ArchiveDeleteConfig) {
    return this.database.tx(async (trx) => {
      const archived = await trx.query<{ archive_id: string }>(
        `select archive_id::text as archive_id from ${config.archiveTable} where id = $1::uuid and tenant_id = $2::uuid limit 1`,
        [id, this.requireTenantId()],
      );
      const archiveId = archived.rows[0]?.archive_id;
      if (!archiveId) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }
      await trx.hardDeleteFromArchive(BigInt(archiveId), {
        archiveTable: config.archiveTable,
        confirm: HARD_DELETE_CONFIRMATION,
      });
      return { status: 'hard-deleted', id };
    });
  }

  private async requireLive<T extends SampleTable>(table: T, id: string) {
    const current = await this.requireById(table, id);
    if (!current) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }
    return current;
  }

  private async requireById<T extends SampleTable>(table: T, id: string) {
    const rows = await this.database.tx(
      async (trx) =>
        trx.select().from(table)
          .where(and(eq(table.id, id), eq(table.tenantId, this.requireTenantId())))
          .limit(1),
      { role: 'reader', readonly: true },
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }
    return row;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new NotFoundException('TENANT_CONTEXT_MISSING');
    }
    return tenantId;
  }

  private requireActorId(): string {
    const actorId = this.requestContext.actorId;
    if (!actorId) {
      throw new NotFoundException('ACTOR_CONTEXT_MISSING');
    }
    return actorId;
  }

  private serializeForResponse<T>(value: T): T {
    if (typeof value === 'bigint') {
      return value.toString() as T;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.serializeForResponse(entry)) as T;
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          this.serializeForResponse(entry),
        ]),
      ) as T;
    }
    return value;
  }
}
