export type SessionScope = 'tenant' | 'identity';
export type SessionAction =
  | 'logout-current'
  | 'revoke-one'
  | 'revoke-others'
  | 'revoke-all'
  | 'revoke-subject'
  | 'revoke-tenant';
export type RegistrationState =
  | 'active'
  | 'revocation_pending'
  | 'revoked'
  | 'failed'
  | 'unsupported'
  | 'expired'
  | 'retired';
export type MutationStatus = 'pending' | 'revoked' | 'unsupported' | 'failed';
export type InvalidationGuarantee =
  | 'immediate_local'
  | 'bounded_local'
  | 'refresh_revoked_access_expires'
  | 'provider_confirmed'
  | 'none';
export type SessionAuthority =
  | 'sessions:self'
  | 'sessions:tenant-manage'
  | 'sessions:identity-manage';

export interface SessionControlCapabilities {
  stableSessionIdentity: boolean;
  listScopes: readonly SessionScope[];
  controlScopes: readonly SessionScope[];
  revokeOne: boolean;
  revokeOthers: boolean;
  revokeAll: boolean;
  localEnforcement: 'immediate' | 'bounded' | 'none';
  providerConfirmation: boolean;
  retryReconciliation: boolean;
  identityGlobalAuthority: boolean;
  sharedAnchorBlastRadius: boolean;
}
export interface SessionGuarantee {
  kind: InvalidationGuarantee;
  effectiveBy: string | null;
  propagationBoundSeconds: number | null;
  accessTokenExpiresAt: string | null;
}
export interface TrustedSessionContext {
  actorId: string;
  subjectId: string;
  tenantId: string;
  currentSessionId: string;
  authorities: ReadonlySet<SessionAuthority>;
  requestId: string;
}
export interface SessionDisplayMetadata {
  deviceLabel?: string;
  client?: string;
  providerLabel?: string;
  userAgentFamily?: string;
  deviceClass?: string;
  country?: string;
  region?: string;
}
export interface SessionRegistration {
  sid: string;
  anchorId: string;
  tenantId: string;
  subjectId: string;
  state: RegistrationState;
  provider: string;
  capabilities: SessionControlCapabilities;
  guarantee: SessionGuarantee;
  metadata: SessionDisplayMetadata;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string | null;
  terminalAt: string | null;
  sharedAnchor: boolean;
}
export interface TrustedProviderAnchorInput {
  id: string;
  provider: string;
  providerSubjectKey: string;
  keyedFingerprint?: Uint8Array;
  encryptedHandle?: Uint8Array;
  capabilities: SessionControlCapabilities;
  expiresAt?: string | null;
}
export interface SessionView extends Omit<
  SessionRegistration,
  'anchorId' | 'subjectId' | 'metadata' | 'sharedAnchor' | 'guarantee'
> {
  sessionId: string;
  guarantee: Omit<SessionGuarantee, 'accessTokenExpiresAt'>;
  current: boolean;
  deviceLabel?: string;
  client?: string;
  userAgent?: string;
  location?: { country?: string; region?: string };
}
export interface SessionInventoryQuery {
  scope?: SessionScope;
  subjectId?: string;
}
export interface SessionControlCommand {
  action: SessionAction;
  operationId: string;
  scope?: SessionScope;
  targetSessionId?: string;
  targetSubjectId?: string;
}
export interface SessionItemResult {
  sid: string;
  status: MutationStatus;
  guarantee: SessionGuarantee;
  errorCode?: string;
}
export interface SessionMutationResult {
  operationId: string;
  action: SessionAction;
  scope: SessionScope;
  status: MutationStatus;
  guarantee: SessionGuarantee;
  effectiveBy: string | null;
  results: SessionItemResult[];
  errorCode?: string;
}
export interface ProviderRevocationRequest {
  operationId: string;
  action: SessionAction;
  registration: SessionRegistration;
}
export interface ProviderRevocationResult {
  status: MutationStatus;
  guarantee: SessionGuarantee;
  errorCode?: string;
}
export interface SessionProviderAdapter {
  readonly provider: string;
  capabilities(context: TrustedSessionContext): Promise<SessionControlCapabilities>;
  revoke(input: ProviderRevocationRequest): Promise<ProviderRevocationResult>;
}
export interface SessionAuditEvent {
  type:
    | 'control-request'
    | 'provider-attempt'
    | 'pending'
    | 'result'
    | 'failure'
    | 'privileged-list';
  operationId?: string;
  sessionId?: string;
  tenantId: string;
  actorId: string;
  action?: SessionAction;
  state?: RegistrationState | MutationStatus;
  errorCode?: string;
  at: string;
}
export interface SessionAuditSink {
  write(event: SessionAuditEvent): void | Promise<void>;
}
export interface SessionOperationRecord {
  key: string;
  requestHash: string;
  result: SessionMutationResult;
  attempts: number;
  nextAttemptAt: string | null;
  leaseUntil: string | null;
}
export interface SessionRegistry {
  list(
    context: TrustedSessionContext,
    query: SessionInventoryQuery,
  ): Promise<SessionRegistration[]>;
  register(input: SessionRegistration): Promise<SessionRegistration>;
  update(registration: SessionRegistration): Promise<SessionRegistration>;
  operation(key: string): Promise<SessionOperationRecord | null>;
  saveOperation(operation: SessionOperationRecord): Promise<void>;
  claimPending(now: string, leaseUntil: string, limit: number): Promise<SessionOperationRecord[]>;
  purgeTerminal(before: string): Promise<number>;
  eraseSubject(tenantId: string, subjectId: string): Promise<number>;
}
export interface StynxSessionControlOptions {
  registry?: SessionRegistry | 'postgres';
  provider: SessionProviderAdapter;
  audit?: SessionAuditSink;
  contextResolver?: () => TrustedSessionContext;
  now?: () => Date;
}
