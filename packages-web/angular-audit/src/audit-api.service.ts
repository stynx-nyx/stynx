import { Injectable, computed, inject, signal } from '@angular/core';
import { from, tap } from 'rxjs';
import type { Signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { STYNX_AUDIT_CLIENT } from './tokens';
import type {
  AuditEventDetail,
  AuditEventSummary,
  AuditEntityHistoryFilter,
  AuditFilter,
  AuditIntegrityReport,
  AuditPage,
} from './types';

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type SdkRequestOptions = {
  query?: QueryParams;
};

function query(input: QueryParams): QueryParams | undefined {
  const filtered: QueryParams = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function requestOptions(queryParams?: QueryParams): SdkRequestOptions | undefined {
  return queryParams ? { query: queryParams } : undefined;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

@Injectable({ providedIn: 'root' })
export class AuditApiService {
  private readonly client = inject(STYNX_AUDIT_CLIENT);
  private readonly eventsState = signal<AuditEventSummary[]>([]);
  private readonly entityHistoryState = signal<AuditEventSummary[]>([]);

  readonly events: Signal<AuditEventSummary[]> = computed(() => this.eventsState());
  readonly entityHistory: Signal<AuditEventSummary[]> = computed(() => this.entityHistoryState());

  listEvents(filter: AuditFilter = {}, cursor?: string): Observable<AuditPage> {
    const params = query({
      actorId: filter.actorId,
      action: filter.action,
      entityKind: filter.entityKind,
      entityId: filter.entityId,
      tenantId: filter.tenantId,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      limit: filter.limit,
      cursor,
    });

    return from(this.client.get<AuditPage>('/audit/events', requestOptions(params))).pipe(
      tap((page) => {
        this.eventsState.set(page.items);
      }),
    );
  }

  getEvent(eventId: string): Observable<AuditEventDetail> {
    return from(this.client.get<AuditEventDetail>(`/audit/events/${segment(eventId)}`));
  }

  listEntityHistory(
    resource: string,
    id: string,
    cursor?: string,
    filter: AuditEntityHistoryFilter = {},
  ): Observable<AuditPage> {
    const params = query({ tenantId: filter.tenantId, limit: filter.limit, cursor });
    return from(
      this.client.get<AuditPage>(
        `/audit/entities/${segment(resource)}/${segment(id)}/history`,
        requestOptions(params),
      ),
    ).pipe(
      tap((page) => {
        this.entityHistoryState.set(page.items);
      }),
    );
  }

  verifyHashIntegrity(eventId: string): Observable<AuditIntegrityReport> {
    return from(this.client.get<AuditIntegrityReport>(`/audit/events/${segment(eventId)}/integrity`));
  }
}
