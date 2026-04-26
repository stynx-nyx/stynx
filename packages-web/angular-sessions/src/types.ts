export interface StynxActiveSession {
  sid: string;
  tenantId: string;
  createdAt: string;
  expiresAt: string;
  current?: boolean;
  scope?: 'tenant' | 'platform';
}

export interface StynxSessionsAdapter {
  list(): Promise<StynxActiveSession[]>;
  revoke(sid: string): Promise<void>;
  revokeOthers(): Promise<void>;
}
