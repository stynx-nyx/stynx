import { decodeSessions, decodeMutation, type SdkActiveSessionResponse } from './response-validation';
import { Injectable, inject } from '@angular/core';
import { StynxSessionService, parseJwtPayload } from '@stynx-nyx/angular-auth';
import { from, map } from 'rxjs';
import type { Observable } from 'rxjs';
import { STYNX_SESSIONS_CLIENT } from './tokens';
import type { StynxActiveSession, StynxSessionMutationResult, StynxSessionsAdapter } from './types';


@Injectable()
export class SdkSessionsAdapter implements StynxSessionsAdapter {
  private readonly client = inject(STYNX_SESSIONS_CLIENT, { optional: true });
  private readonly session = inject(StynxSessionService, { optional: true });

  list(): Observable<StynxActiveSession[]> {
    const currentSid = this.currentSid();
    return from(this.requireClient().get('/auth/sessions').then(decodeSessions)).pipe(
      map((sessions) => sessions.map((session) => this.normalizeSession(session, currentSid))),
    );
  }

  revoke(sid: string): Observable<unknown> {
    return from(this.requireClient().delete(`/auth/sessions/${encodeURIComponent(sid)}`));
  }

  revokeOthers(): Observable<unknown> {
    return from(this.requireClient().post('/auth/sessions/revoke-others', {}));
  }

  revokeWithStatus(
    sid: string,
    operationId?: string,
  ): Observable<StynxSessionMutationResult | null> {
    return from(
      this.requireClient().delete(
        `/auth/sessions/${encodeURIComponent(sid)}`,
        this.options(operationId),
      ),
    ).pipe(map(decodeMutation));
  }

  revokeOthersWithStatus(operationId?: string): Observable<StynxSessionMutationResult | null> {
    return this.mutation('/auth/sessions/revoke-others', operationId);
  }

  logoutCurrent(operationId?: string): Observable<StynxSessionMutationResult | null> {
    return this.mutation('/auth/sessions/logout-current', operationId);
  }

  revokeAll(operationId?: string): Observable<StynxSessionMutationResult | null> {
    return this.mutation('/auth/sessions/revoke-all', operationId);
  }

  private normalizeSession(
    session: SdkActiveSessionResponse,
    currentSid: string | null,
  ): StynxActiveSession {
    const sid = session.sid ?? session.sessionId ?? '';
    const normalized: StynxActiveSession = {
      sid,
      sessionId: session.sessionId ?? sid,
      tenantId: session.tenantId ?? session.tenant_id ?? '',
      createdAt: session.createdAt ?? session.created_at ?? '',
      expiresAt: session.expiresAt ?? session.expires_at ?? '',
      lastIp: session.lastIp ?? session.last_ip ?? null,
      userAgent: session.userAgent ?? session.user_agent ?? null,
      lastSeenAt: session.lastSeenAt ?? session.last_seen_at ?? null,
      current: session.current ?? (currentSid !== null && sid === currentSid),
    };
    if (session.scope) {
      normalized.scope = session.scope;
    }
    if (session.state) normalized.state = session.state;
    if (session.provider) normalized.provider = session.provider;
    if (session.deviceLabel) normalized.deviceLabel = session.deviceLabel;
    if (session.client) normalized.client = session.client;
    if (session.capabilities) normalized.capabilities = session.capabilities;
    if (session.guarantee) normalized.guarantee = session.guarantee;
    return normalized;
  }

  private mutation(
    path: string,
    operationId?: string,
  ): Observable<StynxSessionMutationResult | null> {
    return from(
      this.requireClient().post(
        path,
        {},
        this.options(operationId),
      ),
    ).pipe(map(decodeMutation));
  }

  private options(operationId?: string): { headers?: Record<string, string> } | undefined {
    return operationId ? { headers: { 'Idempotency-Key': operationId } } : undefined;
  }

  private currentSid(): string | null {
    const snapshot = this.session?.snapshot();
    if (snapshot?.sid) {
      return snapshot.sid;
    }
    if (!snapshot?.accessToken) {
      return null;
    }
    const claims = parseJwtPayload(snapshot.accessToken);
    const sid = claims?.sid ?? claims?.session_id ?? claims?.sessionId;
    return typeof sid === 'string' && sid.length > 0 ? sid : null;
  }

  private requireClient() {
    if (!this.client) {
      throw new Error('SdkSessionsAdapter requires provideStynxSessions({ clientFactory }).');
    }
    return this.client;
  }
}
