import { InjectionToken, Injector, runInInjectionContext } from '@angular/core';
import type { StynxSdkClient } from '@stynx-web/sdk';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuditApiService, STYNX_AUDIT_CLIENT } from '../src';

type ClientCall = [path: string, options?: unknown];

function createClient(): StynxSdkClient & { calls: { get: ClientCall[] } } {
  const calls = { get: [] as ClientCall[] };

  return {
    calls,
    get: async (path: string, options?: unknown) => {
      calls.get.push([path, options]);
      if (path === '/audit/events') {
        return {
          items: [
            {
              eventId: 'event-1',
              occurredAt: '2026-05-19T12:00:00.000Z',
              tenantId: 'tenant-1',
              actor: { id: 'actor-1', displayName: 'Ada' },
              action: 'flow.graph.updated',
              entity: { kind: 'flow.graphs', id: 'graph-1' },
              requestId: 'req-1',
              integrity: 'unchecked',
            },
          ],
          nextCursor: 'cursor-2',
        };
      }
      if (path === '/audit/events/event-1') {
        return {
          eventId: 'event-1',
          occurredAt: '2026-05-19T12:00:00.000Z',
          actor: { id: 'actor-1' },
          action: 'flow.graph.updated',
          entity: { kind: 'flow.graphs', id: 'graph-1' },
          integrity: 'valid',
          metadata: { source: 'unit' },
          previousHash: 'prev',
          rowHash: 'row',
        };
      }
      if (path === '/audit/entities/flow.graphs/graph-1/history') {
        return {
          items: [
            {
              eventId: 'event-2',
              occurredAt: '2026-05-19T12:01:00.000Z',
              actor: { id: 'actor-2' },
              action: 'flow.graph.created',
              entity: { kind: 'flow.graphs', id: 'graph-1' },
              integrity: 'valid',
            },
          ],
        };
      }
      if (path === '/audit/events/event-1/integrity') {
        return {
          eventId: 'event-1',
          valid: true,
          checkedAt: '2026-05-19T12:02:00.000Z',
          checkedThroughEventId: 'event-1',
          previousHash: 'prev',
          rowHash: 'row',
          totalChecked: 8,
        };
      }
      throw new Error(`Unhandled GET ${path}`);
    },
  } as StynxSdkClient & { calls: { get: ClientCall[] } };
}

function createService(client: StynxSdkClient): AuditApiService {
  const injector = Injector.create({
    providers: [{ provide: STYNX_AUDIT_CLIENT, useValue: client }],
  });
  return runInInjectionContext(injector, () => new AuditApiService());
}

describe('@stynx-web/angular-audit', () => {
  it('exports the audit SDK client token through the public entrypoint', () => {
    expect(STYNX_AUDIT_CLIENT).toBeInstanceOf(InjectionToken);
    expect(`${STYNX_AUDIT_CLIENT}`).toBe('InjectionToken STYNX_AUDIT_CLIENT');
    expect(AuditApiService).toBeDefined();
  });

  it('resolves the configured audit client from Angular injection', () => {
    const auditClient = {
      request: vi.fn(),
    };
    const injector = Injector.create({
      providers: [{ provide: STYNX_AUDIT_CLIENT, useValue: auditClient }],
    });

    expect(injector.get(STYNX_AUDIT_CLIENT)).toBe(auditClient);
  });

  it('wraps the pinned audit event and integrity endpoints', async () => {
    const client = createClient();
    const service = createService(client);

    await expect(firstValueFrom(service.listEvents({
      actorId: 'actor-1',
      action: 'flow.graph.updated',
      entityKind: 'flow.graphs',
      entityId: 'graph-1',
      tenantId: 'tenant-1',
      dateFrom: '2026-05-01T00:00:00.000Z',
      dateTo: '2026-05-19T23:59:59.999Z',
      limit: 25,
    }, 'cursor-1'))).resolves.toMatchObject({ nextCursor: 'cursor-2' });
    expect(service.events()).toEqual([expect.objectContaining({ eventId: 'event-1' })]);

    await expect(firstValueFrom(service.getEvent('event-1'))).resolves.toMatchObject({
      eventId: 'event-1',
      metadata: { source: 'unit' },
    });
    await expect(firstValueFrom(service.listEntityHistory('flow.graphs', 'graph-1', 'history-cursor', {
      tenantId: 'tenant-1',
      limit: 10,
    })))
      .resolves.toMatchObject({ items: [expect.objectContaining({ eventId: 'event-2' })] });
    expect(service.entityHistory()).toEqual([expect.objectContaining({ eventId: 'event-2' })]);
    await expect(firstValueFrom(service.verifyHashIntegrity('event-1'))).resolves.toMatchObject({
      eventId: 'event-1',
      valid: true,
      totalChecked: 8,
    });

    expect(client.calls.get).toEqual([
      [
        '/audit/events',
        {
          query: {
            actorId: 'actor-1',
            action: 'flow.graph.updated',
            entityKind: 'flow.graphs',
            entityId: 'graph-1',
            tenantId: 'tenant-1',
            dateFrom: '2026-05-01T00:00:00.000Z',
            dateTo: '2026-05-19T23:59:59.999Z',
            limit: 25,
            cursor: 'cursor-1',
          },
        },
      ],
      ['/audit/events/event-1', undefined],
      ['/audit/entities/flow.graphs/graph-1/history', { query: { tenantId: 'tenant-1', limit: 10, cursor: 'history-cursor' } }],
      ['/audit/events/event-1/integrity', undefined],
    ]);
  });

  it('omits empty list query options and URL-encodes path segments', async () => {
    const client = createClient();
    const service = createService(client);

    client.get = vi.fn(async (path: string, options?: unknown) => {
      client.calls.get.push([path, options]);
      if (path.includes('/history')) return { items: [] };
      return { items: [] };
    }) as never;

    await firstValueFrom(service.listEvents());
    await firstValueFrom(service.listEntityHistory('schema/table', 'id with spaces'));

    expect(client.calls.get).toEqual([
      ['/audit/events', undefined],
      ['/audit/entities/schema%2Ftable/id%20with%20spaces/history', undefined],
    ]);
  });
});
