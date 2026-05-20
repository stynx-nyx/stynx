import type { Observable } from 'rxjs';

export interface StynxActiveSession {
  sid: string;
  sessionId?: string;
  tenantId: string;
  createdAt: string;
  expiresAt: string;
  lastIp?: string | null;
  userAgent?: string | null;
  lastSeenAt?: string | null;
  current?: boolean;
  scope?: 'tenant' | 'platform';
}

export type StynxSessionsAdapterResult<T> = Observable<T> | Promise<T>;

export interface StynxSessionsSdkClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export interface StynxSessionsAdapter {
  list(): StynxSessionsAdapterResult<StynxActiveSession[]>;
  revoke(sid: string): StynxSessionsAdapterResult<void>;
  revokeOthers(): StynxSessionsAdapterResult<void>;
}
