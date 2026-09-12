import '@angular/compiler';
import { signal } from '@angular/core';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import { of, throwError } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AuditApiService,
  STYNX_AUDIT_OPTIONS,
  StynxAuditEventDetailComponent,
  StynxAuditHashIntegrityBadgeComponent,
  StynxAuditLogComponent,
  StynxEntityHistoryComponent,
  provideStynxAudit,
} from '../src';
import type { AuditEventDetail, AuditEventSummary, AuditFilter, AuditIntegrityReport, AuditPage } from '../src';

const SUMMARY: AuditEventSummary = {
  eventId: 'event-1',
  occurredAt: '2026-05-19T12:00:00.000Z',
  tenantId: 'tenant-1',
  actor: { id: 'actor-1', displayName: 'Ada', role: 'admin' },
  action: 'flow.graph.updated',
  entity: { kind: 'flow.graphs', id: 'graph-1', label: 'Approval graph' },
  requestId: 'req-1',
  integrity: 'unchecked',
};

const DETAIL: AuditEventDetail = {
  ...SUMMARY,
  sessionId: 'sid-1',
  ipAddress: '127.0.0.1',
  metadata: { source: 'unit' },
  before: { status: 'draft' },
  after: { status: 'published' },
  previousHash: 'prev',
  rowHash: 'row',
};

const REPORT: AuditIntegrityReport = {
  eventId: 'event-1',
  tenantId: 'tenant-1',
  valid: true,
  checkedAt: '2026-05-19T12:02:00.000Z',
  checkedThroughEventId: 'event-1',
  previousHash: 'prev',
  rowHash: 'row',
  totalChecked: 8,
};

class FakeI18nService {
  readonly locale = signal('en-US');

  translate(key: string, params: Record<string, string | number> = {}): string {
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, `${value}`),
      key,
    );
  }
}

function createApi() {
  return {
    listEvents: vi.fn((_filter: AuditFilter, cursor?: string) => {
      const page: AuditPage = {
        items: [{ ...SUMMARY, eventId: cursor ? 'event-2' : 'event-1' }],
      };
      if (!cursor) {
        return of({ ...page, nextCursor: 'cursor-2' });
      }
      return of(page);
    }),
    listEntityHistory: vi.fn((_resource: string, _id: string, cursor?: string) => {
      const page: AuditPage = {
        items: [{
          ...SUMMARY,
          eventId: cursor ? 'event-3' : 'event-2',
          action: cursor ? 'flow.graph.published' : 'flow.graph.created',
          before: cursor ? { status: 'draft' } : null,
          after: cursor ? { status: 'published' } : { status: 'draft' },
        } as AuditEventSummary],
      };
      if (!cursor) {
        return of({ ...page, nextCursor: 'history-cursor-2' });
      }
      return of(page);
    }),
    getEvent: vi.fn(() => of(DETAIL)),
    verifyHashIntegrity: vi.fn(() => of(REPORT)),
  };
}

function createFixture<T>(component: Type<T>, api: ReturnType<typeof createApi>) {
  TestBed.configureTestingModule({
    imports: [component],
    providers: [
      { provide: AuditApiService, useValue: api },
      { provide: StynxI18nService, useClass: FakeI18nService },
    ],
  });
  return TestBed.createComponent(component);
}

function badgeElement(fixture: { nativeElement: HTMLElement }): HTMLElement {
  const badge = fixture.nativeElement.querySelector('.stynx-audit-hash-integrity');
  if (!(badge instanceof HTMLElement)) {
    throw new Error('integrity badge element missing');
  }
  return badge;
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-nyx/angular-audit E.6 components', () => {
  it('renders the audit log, applies filters, and advances cursor-backed pages', () => {
    const api = createApi();
    TestBed.configureTestingModule({
      imports: [StynxAuditLogComponent],
      providers: [
        { provide: AuditApiService, useValue: api },
        { provide: StynxI18nService, useClass: FakeI18nService },
      ],
    });

    const fixture = TestBed.createComponent(StynxAuditLogComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Ada');
    expect(fixture.nativeElement.textContent).toContain('flow.graph.updated');
    expect(fixture.nativeElement.textContent).toContain('Approval graph');
    expect(api.listEvents).toHaveBeenCalledWith({ limit: 25 }, undefined);

    fixture.componentInstance.filterForm.setValue({
      search: 'updated',
      actorId: ' actor-1 ',
      action: '',
      entityKind: 'flow.graphs',
      entityId: 'graph-1',
    });
    fixture.componentInstance.applyFilters();
    fixture.detectChanges();

    expect(api.listEvents).toHaveBeenLastCalledWith({
      actorId: 'actor-1',
      action: 'updated',
      entityKind: 'flow.graphs',
      entityId: 'graph-1',
      limit: 25,
    }, undefined);
    expect(fixture.nativeElement.textContent).toContain('actorId: actor-1');

    fixture.componentInstance.pageChanged(1);
    fixture.detectChanges();

    expect(api.listEvents).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25 }), 'cursor-2');
    expect(fixture.componentInstance.pageIndex()).toBe(1);
  });

  it('clears and refreshes audit filters while preserving fallback labels and read errors', () => {
    const api = createApi();
    TestBed.configureTestingModule({
      imports: [StynxAuditLogComponent],
      providers: [
        { provide: AuditApiService, useValue: api },
        { provide: StynxI18nService, useClass: FakeI18nService },
      ],
    });
    const fixture = TestBed.createComponent(StynxAuditLogComponent);
    fixture.detectChanges();
    const fallbackEvent: AuditEventSummary = {
      ...SUMMARY,
      actor: { id: '', displayName: '' },
      entity: { kind: 'flow.graphs', id: '', label: '' },
    };

    expect(fixture.componentInstance.actorLabel(fallbackEvent)).toBe('System');
    expect(fixture.componentInstance.entityLabel(fallbackEvent)).toBe('flow.graphs');
    expect(fixture.componentInstance.formatTimestamp('not-a-date')).toBe('not-a-date');
    fixture.componentInstance.filterForm.patchValue({ search: 'pending', actorId: 'actor-1' });
    fixture.componentInstance.clearFilters();
    expect(fixture.componentInstance.filterForm.getRawValue()).toEqual({
      search: '',
      actorId: '',
      action: '',
      entityKind: '',
      entityId: '',
    });

    api.listEvents.mockReturnValueOnce(throwError(() => 'audit offline'));
    fixture.componentInstance.refresh();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe('Audit request failed');
    fixture.componentInstance.pageChanged(fixture.componentInstance.pageIndex());
  });

  it('renders detail payloads and verifies event integrity on demand', () => {
    const api = createApi();
    TestBed.configureTestingModule({
      imports: [StynxAuditEventDetailComponent],
      providers: [
        { provide: AuditApiService, useValue: api },
        { provide: StynxI18nService, useClass: FakeI18nService },
      ],
    });

    const fixture = TestBed.createComponent(StynxAuditEventDetailComponent);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();

    expect(api.getEvent).toHaveBeenCalledWith('event-1');
    expect(fixture.nativeElement.textContent).toContain('Ada');
    expect(fixture.nativeElement.textContent).toContain('"status": "draft"');
    expect(fixture.nativeElement.textContent).toContain('"status": "published"');
    expect(fixture.nativeElement.textContent).toContain('"source": "unit"');

    fixture.componentInstance.verifyIntegrity();
    fixture.detectChanges();

    expect(api.verifyHashIntegrity).toHaveBeenCalledWith('event-1');
    expect(fixture.nativeElement.textContent).toContain('audit.integrity.valid');
    expect(fixture.nativeElement.textContent).toContain('event-1');
  });

  it('surfaces integrity verification failures without destructive remediation', () => {
    const api = createApi();
    api.verifyHashIntegrity.mockReturnValueOnce(throwError(() => new Error('network offline')));
    TestBed.configureTestingModule({
      imports: [StynxAuditEventDetailComponent],
      providers: [
        { provide: AuditApiService, useValue: api },
        { provide: StynxI18nService, useClass: FakeI18nService },
      ],
    });

    const fixture = TestBed.createComponent(StynxAuditEventDetailComponent);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();

    fixture.componentInstance.verifyIntegrity();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('network offline');
    expect(fixture.nativeElement.textContent).toContain('audit.detail.integrityUnknownTitle');
  });

  it('renders per-entity history with cursor pagination and per-event integrity badges', () => {
    const api = createApi();
    TestBed.configureTestingModule({
      imports: [StynxEntityHistoryComponent],
      providers: [
        { provide: AuditApiService, useValue: api },
        { provide: StynxI18nService, useClass: FakeI18nService },
      ],
    });

    const fixture = TestBed.createComponent(StynxEntityHistoryComponent);
    fixture.componentRef.setInput('resource', 'flow.graphs');
    fixture.componentRef.setInput('id', 'graph-1');
    fixture.detectChanges();

    expect(api.listEntityHistory).toHaveBeenCalledWith('flow.graphs', 'graph-1', undefined, { limit: 25 });
    expect(api.verifyHashIntegrity).toHaveBeenCalledWith('event-2');
    expect(fixture.nativeElement.textContent).toContain('flow.graph.created');
    expect(fixture.nativeElement.textContent).toContain('"status": "draft"');

    fixture.componentInstance.pageChanged(1);
    fixture.detectChanges();

    expect(api.listEntityHistory).toHaveBeenLastCalledWith('flow.graphs', 'graph-1', 'history-cursor-2', { limit: 25 });
    expect(fixture.componentInstance.pageIndex()).toBe(1);
  });

  it('renders hash integrity badge tones for valid, broken, and unchecked states', () => {
    const api = createApi();
    TestBed.configureTestingModule({
      imports: [StynxAuditHashIntegrityBadgeComponent],
      providers: [
        { provide: AuditApiService, useValue: api },
        { provide: StynxI18nService, useClass: FakeI18nService },
      ],
    });

    const fixture = TestBed.createComponent(StynxAuditHashIntegrityBadgeComponent);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();

    expect(api.verifyHashIntegrity).toHaveBeenCalledWith('event-1');
    expect(fixture.nativeElement.textContent).toContain('audit.integrity.valid');
    expect(fixture.nativeElement.querySelector('[data-tone="valid"]')).toEqual(expect.anything());

    api.verifyHashIntegrity.mockReturnValueOnce(of({ ...REPORT, valid: false, firstBrokenEventId: 'event-0' }));
    fixture.componentRef.setInput('eventId', 'event-2');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('audit.integrity.broken');
    expect(fixture.nativeElement.querySelector('[data-tone="broken"]')).toEqual(expect.anything());

    api.verifyHashIntegrity.mockReturnValueOnce(throwError(() => new Error('integrity unavailable')));
    fixture.componentRef.setInput('eventId', 'event-3');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('audit.integrity.unchecked');
    expect(fixture.nativeElement.querySelector('[data-tone="unchecked"]')).toEqual(expect.anything());
  });

  it('drops blank filter fields and reports thrown audit log errors by message', () => {
    const api = createApi();
    const fixture = createFixture(StynxAuditLogComponent, api);
    fixture.detectChanges();

    fixture.componentInstance.filterForm.setValue({
      search: '',
      actorId: 'actor-1',
      action: '',
      entityKind: '   ',
      entityId: '',
    });
    fixture.componentInstance.applyFilters();
    fixture.detectChanges();

    expect(api.listEvents).toHaveBeenLastCalledWith({ actorId: 'actor-1', limit: 25 }, undefined);
    expect(fixture.componentInstance.activeFilterChips()).toEqual(['actorId: actor-1']);
    expect(fixture.nativeElement.querySelectorAll('.filter-chip')).toHaveLength(1);

    api.listEvents.mockReturnValueOnce(throwError(() => new Error('audit backend unavailable')));
    fixture.componentInstance.refresh();
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe('audit backend unavailable');
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('audit.log.errorTitle');
    expect(fixture.nativeElement.textContent).toContain('audit backend unavailable');
  });

  it('falls back to actor and entity identifiers, empty payloads, and raw timestamps in event detail', () => {
    const api = createApi();
    api.getEvent.mockReturnValueOnce(of({
      ...DETAIL,
      occurredAt: 'not-a-date',
      actor: { id: 'actor-9', displayName: '' },
      entity: { kind: 'flow.graphs', id: 'graph-9', label: '' },
      before: null,
      after: null,
    }));
    const fixture = createFixture(StynxAuditEventDetailComponent, api);
    fixture.componentRef.setInput('eventId', ' event-1 ');
    fixture.detectChanges();

    expect(api.getEvent).toHaveBeenCalledWith('event-1');
    expect(fixture.componentInstance.actorLabel()).toBe('actor-9');
    expect(fixture.componentInstance.entityLabel()).toBe('graph-9');
    expect(fixture.componentInstance.beforeJson()).toBe('{}');
    expect(fixture.componentInstance.afterJson()).toBe('{}');
    expect(fixture.componentInstance.metadataJson()).toContain('"source": "unit"');
    expect(fixture.componentInstance.formatTimestamp('not-a-date')).toBe('not-a-date');
    expect(fixture.nativeElement.textContent).toContain('actor-9');
    expect(fixture.nativeElement.textContent).toContain('graph-9');
    expect(fixture.nativeElement.textContent).toContain('not-a-date');

    api.getEvent.mockReturnValueOnce(of({
      ...DETAIL,
      actor: { id: '', displayName: '' },
      entity: { kind: 'flow.graphs', id: '', label: '' },
    }));
    fixture.componentRef.setInput('eventId', 'event-2');
    fixture.detectChanges();

    expect(fixture.componentInstance.actorLabel()).toBe('System');
    expect(fixture.componentInstance.entityLabel()).toBe('flow.graphs');
    expect(fixture.nativeElement.textContent).toContain('System');
  });

  it('clears the loaded event and skips integrity checks when the event id is blank', () => {
    const api = createApi();
    const fixture = createFixture(StynxAuditEventDetailComponent, api);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();

    expect(fixture.componentInstance.event()).toEqual(DETAIL);

    fixture.componentRef.setInput('eventId', '   ');
    fixture.detectChanges();

    expect(api.getEvent).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.eventIdValue()).toBe('');
    expect(fixture.componentInstance.event()).toBe(null);
    expect(fixture.componentInstance.actorLabel()).toBe('System');
    expect(fixture.componentInstance.entityLabel()).toBe('');
    expect(fixture.nativeElement.textContent).toContain('audit.detail.empty.title');
    expect(fixture.nativeElement.textContent).not.toContain('audit.detail.title');

    fixture.componentInstance.verifyIntegrity();
    fixture.detectChanges();

    expect(api.verifyHashIntegrity).not.toHaveBeenCalled();
    expect(fixture.componentInstance.integrityLoading()).toBe(false);
    expect(fixture.componentInstance.integrity()).toBe(null);
  });

  it('renders broken integrity reports with the first broken event', () => {
    const api = createApi();
    api.verifyHashIntegrity.mockReturnValueOnce(of({ ...REPORT, valid: false, firstBrokenEventId: 'event-0' }));
    const fixture = createFixture(StynxAuditEventDetailComponent, api);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.integrity-panel')).toBe(null);

    fixture.componentInstance.verifyIntegrity();
    fixture.detectChanges();

    expect(fixture.componentInstance.integrityTone()).toBe('broken');
    expect(fixture.componentInstance.integrityTitleKey()).toBe('audit.integrity.broken');
    expect(fixture.nativeElement.querySelector('.integrity-panel[data-tone="broken"]')).toEqual(expect.anything());
    expect(fixture.nativeElement.textContent).toContain('audit.integrity.broken');
    expect(fixture.nativeElement.textContent).toContain('audit.detail.firstBrokenEvent: event-0');
  });

  it('surfaces event load failures and uses a generic message for non-Error rejections', () => {
    const api = createApi();
    api.getEvent.mockReturnValueOnce(throwError(() => new Error('event missing')));
    const fixture = createFixture(StynxAuditEventDetailComponent, api);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();

    expect(fixture.componentInstance.event()).toBe(null);
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toBe('event missing');
    expect(fixture.nativeElement.textContent).toContain('audit.detail.errorTitle');
    expect(fixture.nativeElement.textContent).toContain('event missing');
    expect(fixture.nativeElement.querySelector('.event-shell')).toBe(null);

    api.getEvent.mockReturnValueOnce(throwError(() => 'audit offline'));
    fixture.componentRef.setInput('eventId', 'event-2');
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe('Audit request failed');
    expect(fixture.nativeElement.textContent).toContain('Audit request failed');

    fixture.componentRef.setInput('eventId', 'event-3');
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe('');
    expect(fixture.componentInstance.event()).toEqual(DETAIL);
    expect(fixture.nativeElement.querySelector('.event-shell')).toEqual(expect.anything());
  });

  it('describes neighbouring events in the badge tooltip and re-verifies on refresh', () => {
    const api = createApi();
    api.verifyHashIntegrity.mockReturnValueOnce(of({ ...REPORT, previousEventId: 'event-0', nextEventId: 'event-2' }));
    const fixture = createFixture(StynxAuditHashIntegrityBadgeComponent, api);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();

    const badge = badgeElement(fixture);
    expect(badge.getAttribute('title')).toBe(
      'Checked through event-1, previous event-0, next event-2; 8 events verified.',
    );
    expect(badge.getAttribute('aria-label')).toBe('audit.integrity.valid event-1');
    expect(badge.getAttribute('data-tone')).toBe('valid');

    fixture.componentInstance.refresh();
    fixture.detectChanges();

    expect(api.verifyHashIntegrity).toHaveBeenCalledTimes(2);
    expect(api.verifyHashIntegrity).toHaveBeenLastCalledWith('event-1');
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(badge.getAttribute('title')).toBe('Checked through event-1; 8 events verified.');
  });

  it('keeps the badge unchecked without an event id and reports non-Error failures generically', () => {
    const api = createApi();
    const fixture = createFixture(StynxAuditHashIntegrityBadgeComponent, api);
    fixture.componentRef.setInput('eventId', '   ');
    fixture.detectChanges();

    const badge = badgeElement(fixture);
    expect(api.verifyHashIntegrity).not.toHaveBeenCalled();
    expect(fixture.componentInstance.eventIdValue()).toBe('');
    expect(badge.getAttribute('data-tone')).toBe('unchecked');
    expect(badge.getAttribute('title')).toBe('Hash integrity has not been checked for this event.');
    expect(badge.getAttribute('aria-label')).toBe('audit.integrity.unchecked');
    expect(fixture.componentInstance.iconName()).toBe('info');

    fixture.componentInstance.refresh();
    fixture.detectChanges();

    expect(api.verifyHashIntegrity).not.toHaveBeenCalled();

    api.verifyHashIntegrity.mockReturnValueOnce(throwError(() => 'integrity offline'));
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();

    expect(api.verifyHashIntegrity).toHaveBeenCalledWith('event-1');
    expect(fixture.componentInstance.error()).toBe('Audit integrity check failed');
    expect(fixture.componentInstance.report()).toBe(null);
    expect(badge.getAttribute('data-tone')).toBe('unchecked');
    expect(badge.getAttribute('title')).toBe('Audit integrity check failed');
    expect(badge.getAttribute('aria-label')).toBe('audit.integrity.unchecked event-1');
  });

  it('renders fallback labels and partial diffs for history events and refreshes the current page', () => {
    const api = createApi();
    api.listEntityHistory.mockReturnValueOnce(of({
      items: [
        {
          ...SUMMARY,
          eventId: 'event-9',
          occurredAt: 'not-a-date',
          actor: { id: 'actor-9', displayName: '' },
          entity: { kind: 'flow.graphs', id: 'graph-9', label: '' },
          before: { status: 'published' },
          after: null,
          metadata: { reason: 'cleanup' },
        } as AuditEventSummary,
        {
          ...SUMMARY,
          eventId: 'event-10',
          actor: { id: '', displayName: '' },
          entity: { kind: 'flow.graphs', id: '', label: '' },
        },
      ],
    }));
    const fixture = createFixture(StynxEntityHistoryComponent, api);
    fixture.componentRef.setInput('resource', 'flow.graphs');
    fixture.componentRef.setInput('id', 'graph-1');
    fixture.detectChanges();

    const [deleted, created] = fixture.componentInstance.events();
    expect(deleted?.eventId).toBe('event-9');
    expect(created?.eventId).toBe('event-10');
    if (!deleted || !created) {
      throw new Error('history events missing');
    }
    expect(fixture.componentInstance.actorLabel(deleted)).toBe('actor-9');
    expect(fixture.componentInstance.entityLabel(deleted)).toBe('graph-9');
    expect(fixture.componentInstance.actorLabel(created)).toBe('System');
    expect(fixture.componentInstance.entityLabel(created)).toBe('flow.graphs');
    expect(fixture.componentInstance.formatTimestamp('not-a-date')).toBe('not-a-date');
    expect(fixture.componentInstance.diffText(deleted)).toBe(JSON.stringify({
      before: { status: 'published' },
      metadata: { reason: 'cleanup' },
    }, null, 2));
    expect(fixture.componentInstance.diffText(created)).toBe('{}');
    expect(fixture.nativeElement.querySelectorAll('pre')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('"reason": "cleanup"');
    expect(fixture.nativeElement.textContent).toContain('not-a-date');
    expect(fixture.nativeElement.textContent).toContain('System');
    expect(api.verifyHashIntegrity).toHaveBeenCalledWith('event-9');
    expect(api.verifyHashIntegrity).toHaveBeenCalledWith('event-10');

    fixture.componentInstance.pageChanged(0);
    fixture.detectChanges();

    expect(api.listEntityHistory).toHaveBeenCalledTimes(1);

    fixture.componentInstance.refresh();
    fixture.detectChanges();

    expect(api.listEntityHistory).toHaveBeenCalledTimes(2);
    expect(api.listEntityHistory).toHaveBeenLastCalledWith('flow.graphs', 'graph-1', undefined, { limit: 25 });
    expect(fixture.componentInstance.pageIndex()).toBe(0);
  });

  it('ignores refresh and paging until both resource and id are present, then surfaces load failures', () => {
    const api = createApi();
    const fixture = createFixture(StynxEntityHistoryComponent, api);
    fixture.componentRef.setInput('resource', 'flow.graphs');
    fixture.componentRef.setInput('id', '   ');
    fixture.detectChanges();

    expect(api.listEntityHistory).not.toHaveBeenCalled();
    expect(fixture.componentInstance.canLoad()).toBe(false);
    expect(fixture.componentInstance.events()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('audit.history.emptyInput.title');

    fixture.componentInstance.refresh();
    fixture.componentInstance.pageChanged(1);
    fixture.detectChanges();

    expect(api.listEntityHistory).not.toHaveBeenCalled();
    expect(fixture.componentInstance.pageIndex()).toBe(0);
    expect(fixture.componentInstance.loading()).toBe(false);

    api.listEntityHistory.mockReturnValueOnce(throwError(() => new Error('history offline')));
    fixture.componentRef.setInput('id', 'graph-1');
    fixture.detectChanges();

    expect(api.listEntityHistory).toHaveBeenCalledWith('flow.graphs', 'graph-1', undefined, { limit: 25 });
    expect(fixture.componentInstance.canLoad()).toBe(true);
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toBe('history offline');
    expect(fixture.nativeElement.textContent).toContain('audit.history.errorTitle');
    expect(fixture.nativeElement.textContent).toContain('history offline');

    api.listEntityHistory.mockReturnValueOnce(throwError(() => 'history offline'));
    fixture.componentInstance.refresh();
    fixture.detectChanges();

    expect(api.listEntityHistory).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.error()).toBe('Audit entity history request failed');
    expect(fixture.nativeElement.textContent).toContain('Audit entity history request failed');
  });

  it('defaults the package options token to an empty object until a host provides one', () => {
    TestBed.configureTestingModule({});

    expect(TestBed.inject(STYNX_AUDIT_OPTIONS)).toEqual({});

    TestBed.resetTestingModule();
    const client = { get: vi.fn() } as unknown as StynxSdkClient;
    TestBed.configureTestingModule({
      providers: [provideStynxAudit({ clientFactory: () => client, options: { permission: 'tenant:audit:read' } })],
    });

    expect(TestBed.inject(STYNX_AUDIT_OPTIONS)).toEqual({ permission: 'tenant:audit:read' });
  });
});
