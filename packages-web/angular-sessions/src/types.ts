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
  state?:
    | 'active'
    | 'revocation_pending'
    | 'revoked'
    | 'failed'
    | 'unsupported'
    | 'expired'
    | 'retired';
  provider?: string;
  deviceLabel?: string;
  client?: string;
  capabilities?: StynxSessionControlCapabilities;
  guarantee?: StynxActiveSessionGuarantee;
}

export interface StynxSessionControlCapabilities {
  revokeOne: boolean;
  revokeOthers: boolean;
  revokeAll: boolean;
  localEnforcement: 'immediate' | 'bounded' | 'none';
  providerConfirmation: boolean;
}
export interface StynxSessionGuarantee {
  kind:
    | 'immediate_local'
    | 'bounded_local'
    | 'refresh_revoked_access_expires'
    | 'provider_confirmed'
    | 'none';
  effectiveBy: string | null;
  propagationBoundSeconds: number | null;
  accessTokenExpiresAt: string | null;
}
/** List responses omit the access-token deadline; legacy complete objects remain valid. */
export type StynxActiveSessionGuarantee = Omit<StynxSessionGuarantee, 'accessTokenExpiresAt'> & {
  accessTokenExpiresAt?: string | null;
};

export interface StynxSessionMutationResult {
  operationId: string;
  action:
    | 'logout-current'
    | 'revoke-one'
    | 'revoke-others'
    | 'revoke-all'
    | 'revoke-subject'
    | 'revoke-tenant';
  scope: 'tenant' | 'identity';
  status: 'pending' | 'revoked' | 'unsupported' | 'failed';
  guarantee: StynxSessionGuarantee;
  effectiveBy: string | null;
  results: ReadonlyArray<{
    sid: string;
    status: 'pending' | 'revoked' | 'unsupported' | 'failed';
    guarantee: StynxSessionGuarantee;
    errorCode?: string;
  }>;
  errorCode?: string;
}

export type StynxSessionsAdapterResult<T> = Observable<T> | Promise<T>;

export interface StynxSessionsSdkClient {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown, options?: { headers?: Record<string, string> }): Promise<unknown>;
  delete(path: string, options?: { headers?: Record<string, string> }): Promise<unknown>;
}

export interface StynxSessionsAdapter {
  list(): StynxSessionsAdapterResult<StynxActiveSession[]>;
  revoke(sid: string): StynxSessionsAdapterResult<unknown>;
  revokeOthers(): StynxSessionsAdapterResult<unknown>;
  revokeWithStatus?(
    sid: string,
    operationId?: string,
  ): StynxSessionsAdapterResult<StynxSessionMutationResult | null>;
  revokeOthersWithStatus?(
    operationId?: string,
  ): StynxSessionsAdapterResult<StynxSessionMutationResult | null>;
  logoutCurrent?(
    operationId?: string,
  ): StynxSessionsAdapterResult<StynxSessionMutationResult | null>;
  revokeAll?(operationId?: string): StynxSessionsAdapterResult<StynxSessionMutationResult | null>;
}
