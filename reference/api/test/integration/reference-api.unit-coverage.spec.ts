import { BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx-nyx/data';
import { PermissionCache, PermissionQueryService, StynxJwtValidator } from '@stynx-nyx/auth';
import { RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import { SessionService } from '@stynx-nyx/sessions';
import { DocumentsController } from '../../src/sample/documents.controller';
import { RecordNotesController } from '../../src/sample/record-notes.controller';
import { RecordsController } from '../../src/sample/records.controller';
import { ReferenceDevAuthController } from '../../src/sample/reference-dev-auth.controller';
import { ReferenceDevAuthService } from '../../src/sample/reference-dev-auth.service';
import { ReferenceProbesController } from '../../src/sample/reference-probes.controller';
import { ReferenceSampleService } from '../../src/sample/reference-sample.service';
import { WorkItemEntriesController } from '../../src/sample/work-item-entries.controller';
import { WorkItemLocksController } from '../../src/sample/work-item-locks.controller';
import { WorkItemsController } from '../../src/sample/work-items.controller';
import type { Mock } from 'vitest';

function methods(names: string[]) {
  return Object.fromEntries(names.map((name) => [name, vi.fn(() => ({ name }))]));
}

function queryBuilder() {
  const limits: number[] = [];
  const limit = vi.fn((value?: number) => {
    if (typeof value === 'number') {
      limits.push(value);
    }
    return [];
  });
  const oneLimit = vi.fn((value?: number) => {
    if (typeof value === 'number') {
      limits.push(value);
    }
    return [{ id: 'row-1' }];
  });
  const chain = {
    values: vi.fn(() => undefined),
    set: vi.fn(() => chain),
    where: vi.fn(() => undefined),
  };
  return {
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit })),
          limit: oneLimit,
        })),
        onlyDeleted: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({ limit: vi.fn((value?: number) => {
              if (typeof value === 'number') {
                limits.push(value);
              }
              return [{ archiveId: 1n }];
            }) })),
          })),
        })),
      })),
    })),
    softDelete: vi.fn(async () => ({ id: 'row-1', archiveId: 7n })),
    restoreFromArchive: vi.fn(async () => undefined),
    hardDeleteFromArchive: vi.fn(async () => undefined),
    query: vi.fn(async () => ({ rows: [{ archive_id: '7' }], rowCount: 1 })),
    limits,
  };
}

describe('@stynx-nyx/reference-api controller delegation', () => {
  it('applies environment-driven rate-limit metadata with fallback parsing', async () => {
    const originalRecordCreateLimit = process.env.STYNX_SAMPLE_RECORD_CREATE_LIMIT;
    const originalRecordCreateWindow = process.env.STYNX_SAMPLE_RECORD_CREATE_WINDOW_SECONDS;
    const originalRecordReadLimit = process.env.STYNX_SAMPLE_RECORD_READ_LIMIT;
    const originalRecordReadWindow = process.env.STYNX_SAMPLE_RECORD_READ_WINDOW_SECONDS;
    const originalRecordDeleteLimit = process.env.STYNX_SAMPLE_RECORD_DELETE_LIMIT;
    const originalDocumentWriteLimit = process.env.STYNX_SAMPLE_DOCUMENT_WRITE_LIMIT;
    const originalDocumentWriteWindow = process.env.STYNX_SAMPLE_DOCUMENT_WRITE_WINDOW_SECONDS;
    const originalRecordNoteCreateLimit = process.env.STYNX_SAMPLE_RECORD_NOTE_CREATE_LIMIT;
    const originalRecordNoteCreateWindow = process.env.STYNX_SAMPLE_RECORD_NOTE_CREATE_WINDOW_SECONDS;

    try {
      process.env.STYNX_SAMPLE_RECORD_CREATE_LIMIT = '321';
      process.env.STYNX_SAMPLE_RECORD_CREATE_WINDOW_SECONDS = '45';
      process.env.STYNX_SAMPLE_RECORD_READ_LIMIT = 'bad';
      process.env.STYNX_SAMPLE_RECORD_READ_WINDOW_SECONDS = '-1';
      process.env.STYNX_SAMPLE_RECORD_DELETE_LIMIT = '0';
      process.env.STYNX_SAMPLE_DOCUMENT_WRITE_LIMIT = '12';
      process.env.STYNX_SAMPLE_DOCUMENT_WRITE_WINDOW_SECONDS = 'bad';
      process.env.STYNX_SAMPLE_RECORD_NOTE_CREATE_LIMIT = '22';
      process.env.STYNX_SAMPLE_RECORD_NOTE_CREATE_WINDOW_SECONDS = '33';

      // Module-isolation bridge: under Jest, vi.resetModules() invalidates
      // the require cache so the subsequent dynamic imports re-evaluate with
      // fresh env vars. Under Vitest, vi.resetModules() does the same against
      // Vite's module graph. Dynamic import() works in both runners (the
      // Angular packages already invoke jest with --experimental-vm-modules,
      // and the parity script sets NODE_OPTIONS the same way for all jest
      // invocations).
      vi.resetModules();
      const isolatedRateLimit = await import('@stynx-nyx/ratelimit');
      const isolatedRecords = await import('../../src/sample/records.controller');
      const isolatedDocuments = await import('../../src/sample/documents.controller');
      const isolatedNotes = await import('../../src/sample/record-notes.controller');
      const metadataFor = (controller: object, method: string) =>
        Reflect.getMetadata(
          isolatedRateLimit.STYNX_RATE_LIMIT_ROUTE,
          Object.getOwnPropertyDescriptor(controller, method)?.value,
        );

      expect(metadataFor(isolatedRecords.RecordsController.prototype, 'create')).toMatchObject({
        limit: 321,
        windowSeconds: 45,
      });
      expect(metadataFor(isolatedRecords.RecordsController.prototype, 'list')).toMatchObject({
        limit: 150,
        windowSeconds: 60,
      });
      expect(metadataFor(isolatedRecords.RecordsController.prototype, 'delete')).toMatchObject({
        limit: 60,
      });
      expect(metadataFor(isolatedDocuments.DocumentsController.prototype, 'create')).toMatchObject({
        limit: 12,
        windowSeconds: 60,
      });
      expect(metadataFor(isolatedNotes.RecordNotesController.prototype, 'create')).toMatchObject({
        limit: 22,
        windowSeconds: 33,
      });
    } finally {
      process.env.STYNX_SAMPLE_RECORD_CREATE_LIMIT = originalRecordCreateLimit;
      process.env.STYNX_SAMPLE_RECORD_CREATE_WINDOW_SECONDS = originalRecordCreateWindow;
      process.env.STYNX_SAMPLE_RECORD_READ_LIMIT = originalRecordReadLimit;
      process.env.STYNX_SAMPLE_RECORD_READ_WINDOW_SECONDS = originalRecordReadWindow;
      process.env.STYNX_SAMPLE_RECORD_DELETE_LIMIT = originalRecordDeleteLimit;
      process.env.STYNX_SAMPLE_DOCUMENT_WRITE_LIMIT = originalDocumentWriteLimit;
      process.env.STYNX_SAMPLE_DOCUMENT_WRITE_WINDOW_SECONDS = originalDocumentWriteWindow;
      process.env.STYNX_SAMPLE_RECORD_NOTE_CREATE_LIMIT = originalRecordNoteCreateLimit;
      process.env.STYNX_SAMPLE_RECORD_NOTE_CREATE_WINDOW_SECONDS = originalRecordNoteCreateWindow;
    }
  });

  it('delegates sample resource controllers to ReferenceSampleService', async () => {
    const sample = methods([
      'listRecords',
      'listDeletedRecords',
      'getRecord',
      'createRecord',
      'updateRecord',
      'softDeleteRecord',
      'restoreRecord',
      'hardDeleteRecord',
      'listRecordNotes',
      'getRecordNote',
      'createRecordNote',
      'updateRecordNote',
      'softDeleteRecordNote',
      'restoreRecordNote',
      'hardDeleteRecordNote',
      'listWorkItems',
      'listDeletedWorkItems',
      'getWorkItem',
      'createWorkItem',
      'updateWorkItem',
      'softDeleteWorkItem',
      'restoreWorkItem',
      'hardDeleteWorkItem',
      'listWorkItemEntries',
      'getWorkItemEntry',
      'createWorkItemEntry',
      'updateWorkItemEntry',
      'softDeleteWorkItemEntry',
      'restoreWorkItemEntry',
      'hardDeleteWorkItemEntry',
      'listWorkItemLocks',
      'getWorkItemLock',
      'createWorkItemLock',
      'updateWorkItemLock',
      'softDeleteWorkItemLock',
      'restoreWorkItemLock',
      'hardDeleteWorkItemLock',
      'createDocument',
      'completeDocument',
      'getDocumentDownload',
      'softDeleteDocument',
      'restoreDocument',
      'hardDeleteDocument',
    ]);

    const records = new RecordsController(sample as never);
    records.list({ limit: 10 });
    records.trash({ limit: 5 });
    records.get('record-1');
    records.create({ title: 'Record', email: 'a@example.test' });
    records.update('record-1', { status: 'inactive' });
    records.delete('record-1');
    records.restore('record-1');
    records.hardDelete('record-1');

    const notes = new RecordNotesController(sample as never);
    notes.list({ limit: 10 });
    notes.get('note-1');
    notes.create({ recordId: 'record-1' } as never);
    notes.update('note-1', { label: 'Note' });
    notes.delete('note-1');
    notes.restore('note-1');
    notes.hardDelete('note-1');

    const workItems = new WorkItemsController(sample as never);
    workItems.list({ limit: 10 });
    workItems.trash({ limit: 10 });
    workItems.get('work-1');
    workItems.create({ recordId: 'record-1', code: 'W-1' } as never);
    workItems.update('work-1', { status: 'done' });
    workItems.delete('work-1');
    workItems.restore('work-1');
    workItems.hardDelete('work-1');

    const entries = new WorkItemEntriesController(sample as never);
    entries.list({ limit: 10 });
    entries.get('entry-1');
    entries.create({ workItemId: 'work-1' } as never);
    entries.update('entry-1', { quantity: '2' });
    entries.delete('entry-1');
    entries.restore('entry-1');
    entries.hardDelete('entry-1');

    const locks = new WorkItemLocksController(sample as never);
    locks.list({ limit: 10 });
    locks.get('lock-1');
    locks.create({ workItemId: 'work-1' } as never);
    locks.update('lock-1', { reason: 'manual' });
    locks.delete('lock-1');
    locks.restore('lock-1');
    locks.hardDelete('lock-1');

    const documents = new DocumentsController(sample as never);
    const response = { setHeader: vi.fn() };
    await documents.create({ filename: 'a.txt' } as never, response);
    documents.complete('doc-1', { objectKey: 'k' } as never);
    documents.download('doc-1');
    documents.delete('doc-1');
    documents.restore('doc-1');
    documents.hardDelete('doc-1');

    expect(sample.updateRecord).toHaveBeenCalledWith('record-1', { status: 'inactive' });
    expect(sample.hardDeleteWorkItemLock).toHaveBeenCalledWith('lock-1');
    expect(sample.createDocument).toHaveBeenCalledWith({ filename: 'a.txt' });
  });

  it('delegates dev auth controller operations', () => {
    const auth = methods(['listDemoTenants', 'login']);
    const validator = { validate: vi.fn() };
    const controller = new ReferenceDevAuthController(auth as never, validator as never);

    controller.listDemoTenants();
    controller.login({ email: 'ADMIN@EXAMPLE.TEST', tenantSlug: 'sample-demo' });

    expect(auth.listDemoTenants).toHaveBeenCalledTimes(1);
    expect(auth.login).toHaveBeenCalledWith({ email: 'ADMIN@EXAMPLE.TEST', tenantSlug: 'sample-demo' });
  });

  it('verifies STYNX auth headers and rejects missing bearer tokens', async () => {
    const validator = { validate: vi.fn(async () => ({ sub: 'user-1' })) };
    const controller = new ReferenceDevAuthController({} as never, validator as never);
    const response = { setHeader: vi.fn() };

    await expect(controller.authVerify(response, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.authVerify(response, ['raw-token'])).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.authVerify(response, ['Bearer token-1'])).resolves.toEqual({ status: 'ok' });
    await expect(controller.authVerify(response, 'Bearer token-2')).resolves.toEqual({ status: 'ok' });
    expect(validator.validate).toHaveBeenCalledWith('token-1');
    expect(response.setHeader).toHaveBeenCalledWith('X-Stynx-Auth-Verify-Ms', expect.any(String));
  });
});

describe('@stynx-nyx/reference-api sample service', () => {
  it('passes document operations through to DocumentsService and returns status envelopes', async () => {
    const documents = methods(['initiate', 'complete', 'getDownloadUrl', 'softRemove', 'restore', 'hardRemove']);
    const service = new ReferenceSampleService({} as never, {} as never, documents as never);

    await service.createDocument({ filename: 'a.txt' } as never);
    await service.completeDocument('doc-1', { objectKey: 'k' } as never);
    await service.getDocumentDownload('doc-1');
    await expect(service.softDeleteDocument('doc-1')).resolves.toEqual({ status: 'soft-deleted', id: 'doc-1' });
    await expect(service.restoreDocument('doc-1')).resolves.toEqual({ status: 'restored', id: 'doc-1' });
    await expect(service.hardDeleteDocument('doc-1')).resolves.toEqual({ status: 'hard-deleted', id: 'doc-1' });

    expect(documents.initiate).toHaveBeenCalledWith({ filename: 'a.txt' });
    expect(documents.hardRemove).toHaveBeenCalledWith('doc-1');
  });

  it('creates and updates sample records with defaults and actor context', async () => {
    const trx = queryBuilder();
    const database = { tx: vi.fn(async (callback: (input: typeof trx) => unknown) => callback(trx)) };
    const requestContext = { tenantId: 'tenant-1', actorId: 'actor-1' } as RequestContext;
    const service = new ReferenceSampleService(database as never, requestContext, {} as never);
    vi.spyOn(service as never, 'requireById').mockResolvedValue({ id: 'row-1' } as never);
    vi.spyOn(service as never, 'requireLive').mockResolvedValue({ id: 'row-1' } as never);

    await service.createRecord({ title: 'Record', email: 'a@example.test' });
    await service.createRecord({
      title: 'Record',
      email: 'a@example.test',
      externalRef: 'external-1',
      status: 'inactive',
      ownerUserId: 'owner-1',
    });
    await service.updateRecord('record-1', { title: 'Changed', externalRef: null });
    await service.updateRecord('record-1', {
      title: 'Changed',
      email: 'b@example.test',
      externalRef: 'external-2',
      status: 'active',
      ownerUserId: 'owner-2',
    });
    await service.updateRecord('record-1', {});
    await service.createRecordNote({
      recordId: 'record-1',
      kind: 'primary',
      label: 'Note',
      detail: 'Detail',
      region: 'BR',
      code: 'N',
    });
    await service.createRecordNote({
      recordId: 'record-1',
      kind: 'secondary',
      label: 'Note',
      detail: 'Detail',
      detail2: 'Detail 2',
      region: 'BR',
      code: 'N2',
      locale: 'pt-BR',
    });
    await service.updateRecordNote('note-1', { detail2: 'More' });
    await service.updateRecordNote('note-1', {
      kind: 'primary',
      label: 'Updated',
      detail: 'Detail',
      detail2: null,
      region: 'US',
      code: 'N3',
      locale: 'en-US',
    });
    await service.updateRecordNote('note-1', {});
    await service.createWorkItem({
      recordId: 'record-1',
      code: 'W-1',
      openedOn: '2026-05-18',
      targetOn: '2026-05-19',
    });
    await service.createWorkItem({
      recordId: 'record-1',
      createdByUserId: 'creator-1',
      code: 'W-2',
      openedOn: '2026-05-18',
      targetOn: '2026-05-19',
      category: 'OPS',
      totalUnits: 10,
      status: 'open',
    });
    await service.updateWorkItem('work-1', { totalUnits: 10 });
    await service.updateWorkItem('work-1', {
      recordId: 'record-2',
      createdByUserId: 'creator-2',
      code: 'W-3',
      openedOn: '2026-05-20',
      targetOn: '2026-05-21',
      category: 'OPS',
      totalUnits: 20,
      status: 'done',
    });
    await service.updateWorkItem('work-1', {});
    await service.createWorkItemEntry({ workItemId: 'work-1', description: 'Entry', quantity: '2', unitUnits: 3 });
    await service.updateWorkItemEntry('entry-1', { quantity: '3' });
    await service.updateWorkItemEntry('entry-1', { description: 'Updated', quantity: '4', unitUnits: 5 });
    await service.updateWorkItemEntry('entry-1', {});
    await service.createWorkItemLock({
      workItemId: 'work-1',
      lockedAt: '2026-05-18T00:00:00Z',
      amountUnits: 12,
      reason: 'manual',
    });
    await service.createWorkItemLock({
      workItemId: 'work-1',
      lockedAt: '2026-05-18T00:00:00Z',
      amountUnits: 12,
      reason: 'manual',
      externalRef: 'lock-ext',
    });
    await service.updateWorkItemLock('lock-1', { externalRef: null });
    await service.updateWorkItemLock('lock-1', {
      lockedAt: '2026-05-19T00:00:00Z',
      amountUnits: 13,
      reason: 'changed',
      externalRef: 'lock-ext-2',
    });
    await service.updateWorkItemLock('lock-1', {});

    expect(trx.insert).toHaveBeenCalledTimes(9);
    expect(trx.update).toHaveBeenCalledTimes(15);
    expect(service['requireById']).toHaveBeenCalledTimes(24);
  });

  it('covers delete helpers, missing context errors, and bigint response serialization', async () => {
    const trx = queryBuilder();
    const database = { tx: vi.fn(async (callback: (input: typeof trx) => unknown) => callback(trx)) };
    const service = new ReferenceSampleService(
      database as never,
      { tenantId: 'tenant-1', actorId: 'actor-1' } as RequestContext,
      {} as never,
    );
    vi.spyOn(service as never, 'requireLive').mockResolvedValue({ id: 'row-1' } as never);
    vi.spyOn(service as never, 'requireById').mockResolvedValue({ id: 'row-1' } as never);

    await expect(service.softDeleteRecord('record-1')).resolves.toMatchObject({ archiveId: '7' });
    await expect(service.restoreWorkItem('work-1')).resolves.toEqual({ id: 'row-1' });
    await expect(service.hardDeleteRecordNote('note-1')).resolves.toEqual({
      status: 'hard-deleted',
      id: 'note-1',
    });
    expect(trx.hardDeleteFromArchive).toHaveBeenCalledWith(7n, expect.objectContaining({
      confirm: 'I understand this is irrecoverable',
    }));

    const missingTenant = new ReferenceSampleService(
      database as never,
      { actorId: 'actor-1' } as RequestContext,
      {} as never,
    );
    await expect(missingTenant.listRecords()).rejects.toThrow('TENANT_CONTEXT_MISSING');

    const missingActor = new ReferenceSampleService(
      database as never,
      { tenantId: 'tenant-1' } as RequestContext,
      {} as never,
    );
    await expect(missingActor.createRecord({ title: 'Record', email: 'a@example.test' })).rejects.toThrow(
      'ACTOR_CONTEXT_MISSING',
    );
  });

  it('covers list defaults, clamp boundaries, missing archive rows, and serialization recursion', async () => {
    const trx = queryBuilder();
    const database = { tx: vi.fn(async (callback: (input: typeof trx) => unknown) => callback(trx)) };
    const service = new ReferenceSampleService(
      database as never,
      { tenantId: 'tenant-1', actorId: 'actor-1' } as RequestContext,
      {} as never,
    );

    await service.listRecords();
    await service.listRecordNotes({ limit: Number.NaN });
    await service.listRecordNotes();
    await service.listWorkItems({ limit: 500 });
    await service.listWorkItems();
    await service.listWorkItemEntries({ limit: -10 });
    await service.listWorkItemEntries();
    await service.listWorkItemLocks({ limit: 25 });
    await service.listWorkItemLocks();
    await service.listDeletedRecords();
    await service.listDeletedWorkItems({ limit: 2 });
    await service.listDeletedWorkItems();
    expect(trx.limits).toEqual([50, 50, 50, 200, 50, 1, 50, 25, 50, 50, 2, 50]);

    const missingArchive = queryBuilder();
    missingArchive.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const missingArchiveDb = {
      tx: vi.fn(async (callback: (input: typeof missingArchive) => unknown) => callback(missingArchive)),
    };
    const missingArchiveService = new ReferenceSampleService(
      missingArchiveDb as never,
      { tenantId: 'tenant-1', actorId: 'actor-1' } as RequestContext,
      {} as never,
    );
    await expect(missingArchiveService.hardDeleteWorkItem('work-1')).rejects.toThrow('RESOURCE_NOT_FOUND');

    await expect((service as unknown as {
      requireLive(table: unknown, id: string): Promise<unknown>;
    }).requireLive({} as never, 'missing')).resolves.toMatchObject({ id: 'row-1' });
    vi.spyOn(service as never, 'requireById').mockResolvedValueOnce(null as never);
    await expect((service as unknown as {
      requireLive(table: unknown, id: string): Promise<unknown>;
    }).requireLive({} as never, 'missing')).rejects.toThrow('RESOURCE_NOT_FOUND');

    const emptySelect = queryBuilder();
    emptySelect.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    });
    const emptyDb = {
      tx: vi.fn(async (callback: (input: typeof emptySelect) => unknown) => callback(emptySelect)),
    };
    await expect(new ReferenceSampleService(
      emptyDb as never,
      { tenantId: 'tenant-1', actorId: 'actor-1' } as RequestContext,
      {} as never,
    ).getRecord('missing')).rejects.toThrow('RESOURCE_NOT_FOUND');
    expect((service as unknown as {
      serializeForResponse(value: unknown): unknown;
    }).serializeForResponse({ nested: [1n, { ok: 2n }, null] })).toEqual({
      nested: ['1', { ok: '2' }, null],
    });
  });
});

describe('@stynx-nyx/reference-api dev auth service and probes', () => {
  it('logs in through demo tenant setup and primes permission cache when available', async () => {
    const queries: Array<{ rows: Record<string, unknown>[] }> = [
      { rows: [] },
      { rows: [{ id: 'user-1' }] },
      { rows: [] },
      { rows: [{ id: 'membership-1' }] },
      { rows: [{ id: 'role-1' }] },
    ];
    const trx = { query: vi.fn(async () => queries.shift() ?? { rows: [] }) };
    const database = {
      withSystemContext: vi.fn(async (_label: string, callback: () => Promise<unknown>) => callback()),
      tx: vi.fn(async (callback: (input: typeof trx) => Promise<unknown>) => callback(trx)),
    };
    const session = {
      create: vi.fn(async () => ({ sid: 'sid-1', expiresAt: new Date('2026-05-18T01:00:00Z') })),
    };
    const permissions = {
      resolveForUser: vi.fn(async () => ({
        membershipId: 'membership-1',
        permissions: ['sample:record:read'],
        hash: 'hash-1',
        generation: 1,
      })),
    };
    const cache = { prime: vi.fn(async () => undefined) };
    const providers = new Map<unknown, unknown>([
      [Database, database],
      [SessionService, session],
      [PermissionQueryService, permissions],
      [PermissionCache, cache],
    ]);
    const service = new ReferenceDevAuthService({ get: vi.fn((token: unknown) => providers.get(token)) } as unknown as ModuleRef);

    await expect(service.login({ email: ' Admin@Example.Test ', tenantSlug: 'sample-ops' })).resolves.toMatchObject({
      sid: 'sid-1',
      email: 'admin@example.test',
      permissions: ['sample:record:read'],
    });
    expect(cache.prime).toHaveBeenCalledWith(expect.objectContaining({ sid: 'sid-1' }), expect.any(Date));
  });

  it('logs in with default tenant/email and tolerates missing optional permission cache', async () => {
    const queries: Array<{ rows: Record<string, unknown>[] }> = [
      { rows: [] }, // ensureTenant upsert tenant
      { rows: [] }, // ensureTenant settings
      { rows: [] }, // ensureUser lookup
      { rows: [{ id: 'inserted-user' }] }, // ensureUser insert
      { rows: [] }, // ensureMembership lookup
      { rows: [{ id: 'inserted-membership' }] }, // ensureMembership insert
      { rows: [] }, // ensureAdminRole upsert
      { rows: [{ id: 'role-1' }] }, // ensureAdminRole select
      { rows: [] }, // ensureAdminRolePerms
      { rows: [] }, // membership_roles
    ];
    const trx = { query: vi.fn(async () => queries.shift() ?? { rows: [] }) };
    const database = {
      withSystemContext: vi.fn(async (_label: string, callback: () => Promise<unknown>) => callback()),
      tx: vi.fn(async (callback: (input: typeof trx) => Promise<unknown>) => callback(trx)),
    };
    const session = {
      create: vi.fn(async () => ({ sid: 'sid-2', expiresAt: new Date('2026-05-18T01:00:00Z') })),
    };
    const permissions = {
      resolveForUser: vi.fn(async () => ({
        membershipId: 'inserted-membership',
        permissions: [],
        hash: 'hash-2',
        generation: 2,
      })),
    };
    const providers = new Map<unknown, unknown>([
      [Database, database],
      [SessionService, session],
      [PermissionQueryService, permissions],
    ]);
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === PermissionCache) {
          throw new Error('optional missing');
        }
        return providers.get(token);
      }),
    };
    const service = new ReferenceDevAuthService(moduleRef as unknown as ModuleRef);

    await expect(service.login({})).resolves.toMatchObject({
      sid: 'sid-2',
      tenantId: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
      email: 'admin@sample-demo.test',
    });
    expect(session.create).toHaveBeenCalledWith(
      'inserted-user',
      '01978f4a-32bf-7c27-a131-fd73a9e001a1',
      'admin@sample-demo.test',
      {},
      expect.objectContaining({ membershipId: 'inserted-membership' }),
    );
  });

  it('resolves tenants by explicit id and falls back from unknown slug', () => {
    const service = new ReferenceDevAuthService({ get: vi.fn() } as unknown as ModuleRef);
    const privateService = service as unknown as {
      resolveTenant(tenantId?: string, tenantSlug?: string): { id: string; slug: string };
    };

    expect(privateService.resolveTenant(' 01978f4a-32bf-7c27-a131-fd73a9e001a2 ')).toMatchObject({
      slug: 'sample-ops',
    });
    expect(privateService.resolveTenant(undefined, 'missing')).toMatchObject({
      slug: 'sample-demo',
    });
  });

  it('covers direct dev-auth existing membership and missing inserted ids', async () => {
    const service = new ReferenceDevAuthService({ get: vi.fn() } as unknown as ModuleRef) as unknown as {
      ensureUser(trx: { query: Mock }, email: string): Promise<string>;
      ensureMembership(trx: { query: Mock }, tenantId: string, userId: string): Promise<string>;
      ensureAdminRole(trx: { query: Mock }, tenantId: string): Promise<string>;
    };
    const trx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-membership' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await expect(service.ensureUser(trx, 'a@example.test')).resolves.toBe('existing-user');
    await expect(service.ensureMembership(trx, 'tenant-1', 'user-1')).resolves.toBe('existing-membership');
    await expect(service.ensureAdminRole(trx, 'tenant-1')).resolves.toBe('');
  });

  it('rejects blank dev auth email and unavailable providers', async () => {
    const service = new ReferenceDevAuthService({ get: vi.fn(() => undefined) } as unknown as ModuleRef);

    await expect(service.login({ email: '   ' })).rejects.toThrow('Email is required');
    await expect(service.login({ email: 'admin@example.test' })).rejects.toThrow(
      'Database provider is unavailable',
    );
  });

  it('covers probe error and hot-path branches', async () => {
    const rateLimitStore = { consume: vi.fn(async () => undefined) };
    const moduleRef = { get: vi.fn(() => rateLimitStore) };
    const database = {
      tx: vi.fn(async (callback: (trx: { query: Mock }) => Promise<unknown>) =>
        callback({ query: vi.fn(async () => ({ rows: [], rowCount: 1 })) }),
      ),
    };
    const requestContextMutator = {
      runWithRequestContext: vi.fn(async (_ctx: unknown, callback: () => Promise<unknown>) => callback()),
    };
    const validator = {
      validate: vi.fn(async () => ({ sub: 'user-1', tenantId: 'tenant-1', sid: 'sid-1' })),
    };
    const controller = new ReferenceProbesController(
      moduleRef as unknown as ModuleRef,
      database as unknown as Database,
      requestContextMutator as unknown as RequestContextMutator,
      validator as unknown as StynxJwtValidator,
    );
    const response = { setHeader: vi.fn() };

    await expect(controller.dataTx(response, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.dataTx(response, ['raw'])).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.dataTx(response, ['Bearer token-1'])).resolves.toEqual({
      status: 'ok',
      dataTxOverheadStatistic: 'trimmed_min',
    });
    await expect(controller.dataTx(response, 'Bearer token-2')).resolves.toEqual({
      status: 'ok',
      dataTxOverheadStatistic: 'trimmed_min',
    });
    await expect(controller.rateLimit(response)).resolves.toMatchObject({
      status: 'ok',
      rateLimitOverheadStatistic: 'trimmed_min',
    });
    await expect(controller.rateLimit(response, 'true')).resolves.toMatchObject({
      status: 'ok',
      rateLimitOverheadStatistic: 'trimmed_min',
    });
    expect(controller.idempotency()).toEqual({ status: 'ok' });
    await expect(controller.readonlyWrite()).resolves.toEqual({ status: 'unexpected' });
    expect(rateLimitStore.consume).toHaveBeenCalledTimes(27);
  });

  it('throws when the rate limit store provider is unavailable', async () => {
    const controller = new ReferenceProbesController(
      { get: vi.fn(() => null) } as unknown as ModuleRef,
      {} as unknown as Database,
      {} as unknown as RequestContextMutator,
      {} as unknown as StynxJwtValidator,
    );

    await expect(controller.rateLimit({ setHeader: vi.fn() })).rejects.toThrow(
      'Rate limit store is unavailable',
    );
  });
});
