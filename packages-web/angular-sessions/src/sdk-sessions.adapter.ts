import { Injectable, inject } from '@angular/core';
import { StynxSessionService, parseJwtPayload } from '@stynx-web/angular-auth';
import { from, map } from 'rxjs';
import type { Observable } from 'rxjs';
import { STYNX_SESSIONS_CLIENT } from './tokens';
import type { StynxActiveSession, StynxSessionsAdapter } from './types';

interface SdkActiveSessionResponse {
  sid?: string;
  sessionId?: string;
  tenantId?: string;
  tenant_id?: string;
  createdAt?: string;
  created_at?: string;
  expiresAt?: string;
  expires_at?: string;
  lastIp?: string | null;
  last_ip?: string | null;
  userAgent?: string | null;
  user_agent?: string | null;
  lastSeenAt?: string | null;
  last_seen_at?: string | null;
  current?: boolean;
  scope?: 'tenant' | 'platform';
}

@Injectable()
export class SdkSessionsAdapter implements StynxSessionsAdapter {
  private readonly client = inject(STYNX_SESSIONS_CLIENT, { optional: true });
  private readonly session = inject(StynxSessionService, { optional: true });

  list(): Observable<StynxActiveSession[]> {
    const currentSid = this.currentSid();
    return from(this.requireClient().get<SdkActiveSessionResponse[]>('/auth/sessions')).pipe(
      map((sessions) => sessions.map((session) => this.normalizeSession(session, currentSid))),
    );
  }

  revoke(sid: string): Observable<void> {
    return from(this.requireClient().delete<void>(`/auth/sessions/${encodeURIComponent(sid)}`));
  }

  revokeOthers(): Observable<void> {
    return from(this.requireClient().post<void>('/auth/sessions/revoke-others', {}));
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
    return normalized;
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
