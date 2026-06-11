import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import type { StynxSdkClient } from '@stynx-web/sdk';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditApiService } from '../src/audit-api.service';
import { StynxAuditLogComponent } from '../src/audit-log.component';
import { STYNX_AUDIT_CLIENT } from '../src/tokens';
import type { AuditFilter, AuditPage } from '../src/types';

function createService(client: StynxSdkClient): AuditApiService {
  const injector = Injector.create({
    providers: [{ provide: STYNX_AUDIT_CLIENT, useValue: client }],
  });
  return runInInjectionContext(injector, () => new AuditApiService());
}

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (!String(error).includes('Cannot set base providers')) {
      throw error;
    }
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular-audit W04 read contract depth', () => {
  it('sends the audit read contract query shape exactly and omits nullish filters', async () => {
    const calls: Array<[string, unknown]> = [];
    const client = {
      get: vi.fn(async (path: string, options?: unknown) => {
        calls.push([path, options]);
        return { items: [], nextCursor: undefined };
      }),
    } as unknown as StynxSdkClient;
    const service = createService(client);
    const filter: AuditFilter = {
      actorId: 'actor-1',
      action: 'flow.graph.publish',
      entityKind: 'flow.graphs',
      entityId: 'graph-1',
      tenantId: 'tenant-a',
      dateFrom: '2026-06-01T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      limit: 50,
    };

    await firstValueFrom(service.listEvents(filter, 'cursor-1'));
    await firstValueFrom(service.listEvents({ tenantId: null as never }));

    expect(calls).toEqual([
      [
        '/audit/events',
        {
          query: {
            actorId: 'actor-1',
            action: 'flow.graph.publish',
            entityKind: 'flow.graphs',
            entityId: 'graph-1',
            tenantId: 'tenant-a',
            dateFrom: '2026-06-01T00:00:00.000Z',
            dateTo: '2026-06-10T23:59:59.999Z',
            limit: 50,
            cursor: 'cursor-1',
          },
        },
      ],
      ['/audit/events', undefined],
    ]);
  });

  it('renders the audit log empty state when the read contract returns no visible tenant events', () => {
    const api = {
      listEvents: vi.fn((_filter: AuditFilter, _cursor?: string) => of({ items: [] } satisfies AuditPage)),
    };
    TestBed.configureTestingModule({
      imports: [StynxAuditLogComponent],
      providers: [
        { provide: AuditApiService, useValue: api },
        {
          provide: StynxI18nService,
          useValue: {
            locale: () => 'en-US',
            translate: (key: string) => ({
              'audit.log.empty.description': 'No audit events are visible for this tenant.',
              'audit.log.empty.title': 'No audit events',
              'audit.log.title': 'Audit log',
            })[key] ?? key,
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(StynxAuditLogComponent);
    fixture.detectChanges();

    expect(api.listEvents).toHaveBeenCalledWith({ limit: 25 }, undefined);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No audit events');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No audit events are visible for this tenant.');
  });
});
