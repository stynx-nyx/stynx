import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { of, throwError } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AuditApiService,
  StynxAuditEventDetailComponent,
  StynxAuditHashIntegrityBadgeComponent,
  StynxAuditLogComponent,
  StynxEntityHistoryComponent,
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

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular-audit E.6 components', () => {
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
    expect(fixture.nativeElement.querySelector('[data-tone="valid"]')).toBeTruthy();

    api.verifyHashIntegrity.mockReturnValueOnce(of({ ...REPORT, valid: false, firstBrokenEventId: 'event-0' }));
    fixture.componentRef.setInput('eventId', 'event-2');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('audit.integrity.broken');
    expect(fixture.nativeElement.querySelector('[data-tone="broken"]')).toBeTruthy();

    api.verifyHashIntegrity.mockReturnValueOnce(throwError(() => new Error('integrity unavailable')));
    fixture.componentRef.setInput('eventId', 'event-3');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('audit.integrity.unchecked');
    expect(fixture.nativeElement.querySelector('[data-tone="unchecked"]')).toBeTruthy();
  });
});
