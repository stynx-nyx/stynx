import { EventEmitter } from 'node:events';
import type {
  RefreshTokenLookup,
  SessionRecord,
  SessionStatus,
  SessionStore,
  SessionPolicyOptions,
  SessionPolicyResult,
} from './types';
import { SessionConflictError, SessionExchangeError } from './errors';

export class InMemorySessionStore implements SessionStore {
  readonly invalidationEvents = new EventEmitter();
  readonly invalidations: string[] = [];

  private readonly sessions = new Map<string, SessionRecord>();
  private readonly refreshLookups = new Map<string, RefreshTokenLookup>();
  private readonly sessionsByUser = new Map<string, Set<string>>();
  private readonly sessionsByTenant = new Map<string, Set<string>>();

  async createSession(record: SessionRecord): Promise<void> {
    this.sessions.set(record.sid, { ...record });
    this.refreshLookups.set(record.refreshTokenHash, {
      sid: record.sid,
      familyId: record.refreshFamilyId,
      state: 'active',
    });
    this.addIndex(this.sessionsByUser, record.userId, record.sid);
    this.addIndex(this.sessionsByTenant, record.tenantId, record.sid);
  }

  async createWithPolicy(record: SessionRecord, options: SessionPolicyOptions): Promise<SessionPolicyResult> {
    const now = Date.parse(options.now);
    const prior = options.priorSessionId ? this.sessions.get(options.priorSessionId) : undefined;
    if (options.priorSessionId && (!prior || prior.userId !== record.userId || !this.isActive(prior, now))) {
      throw new SessionExchangeError('SESSION_NOT_ACTIVE', 'Prior session is not active for this user');
    }
    const conflicts = [...(this.sessionsByUser.get(record.userId) ?? [])]
      .filter((sid) => sid !== options.priorSessionId)
      .map((sid) => this.sessions.get(sid))
      .filter((session): session is SessionRecord => !!session && session.tenantId === record.tenantId && this.isActive(session, now));
    if (options.mode === 'reject-new' && conflicts.length > 0) {
      throw new SessionConflictError();
    }
    const revoked: SessionRecord[] = [];
    for (const session of [...(options.mode === 'revoke-existing' ? conflicts : []), ...(prior ? [prior] : [])]) {
      this.sessions.delete(session.sid);
      this.refreshLookups.set(session.refreshTokenHash, {
        sid: session.sid,
        familyId: session.refreshFamilyId,
        state: 'used',
      });
      this.sessionsByUser.get(session.userId)?.delete(session.sid);
      this.sessionsByTenant.get(session.tenantId)?.delete(session.sid);
      revoked.push({ ...session, status: 'revoked', revokedAt: options.now, updatedAt: options.now });
    }
    this.sessions.set(record.sid, { ...record });
    this.refreshLookups.set(record.refreshTokenHash, {
      sid: record.sid,
      familyId: record.refreshFamilyId,
      state: 'active',
    });
    this.addIndex(this.sessionsByUser, record.userId, record.sid);
    this.addIndex(this.sessionsByTenant, record.tenantId, record.sid);
    return { created: { ...record }, revoked };
  }

  async probeReadiness(): Promise<boolean> { return true; }

  private isActive(record: SessionRecord, now: number): boolean {
    return record.status === 'active' && Date.parse(record.expiresAt) > now && Date.parse(record.idleExpiresAt) > now;
  }

  async getSession(sid: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(sid);
    return session ? { ...session } : null;
  }

  async lookupRefreshToken(hash: string): Promise<RefreshTokenLookup | null> {
    const lookup = this.refreshLookups.get(hash);
    return lookup ? { ...lookup } : null;
  }

  async rotateRefreshToken(
    sid: string,
    currentHash: string,
    nextHash: string,
    idleExpiresAt: string,
    touchedAt: string,
  ): Promise<SessionRecord | null> {
    const session = this.sessions.get(sid);
    const lookup = this.refreshLookups.get(currentHash);
    if (!session || !lookup || lookup.state !== 'active' || session.refreshTokenHash !== currentHash) {
      return null;
    }

    this.refreshLookups.set(currentHash, {
      sid,
      familyId: session.refreshFamilyId,
      state: 'used',
    });

    const updated: SessionRecord = {
      ...session,
      refreshTokenHash: nextHash,
      idleExpiresAt,
      lastTouchedAt: touchedAt,
      updatedAt: touchedAt,
    };
    this.sessions.set(sid, updated);
    this.refreshLookups.set(nextHash, {
      sid,
      familyId: session.refreshFamilyId,
      state: 'active',
    });
    return { ...updated };
  }

  async touchSession(
    sid: string,
    idleExpiresAt: string,
    touchedAt: string,
  ): Promise<SessionRecord | null> {
    const session = this.sessions.get(sid);
    if (!session) {
      return null;
    }
    const updated: SessionRecord = {
      ...session,
      idleExpiresAt,
      lastTouchedAt: touchedAt,
      updatedAt: touchedAt,
    };
    this.sessions.set(sid, updated);
    return { ...updated };
  }

  async revokeSession(
    sid: string,
    revokedAt: string,
    status: SessionStatus,
  ): Promise<SessionRecord | null> {
    const session = this.sessions.get(sid);
    if (!session) {
      return null;
    }

    this.sessions.delete(sid);
    this.refreshLookups.set(session.refreshTokenHash, {
      sid,
      familyId: session.refreshFamilyId,
      state: 'used',
    });
    this.sessionsByUser.get(session.userId)?.delete(sid);
    this.sessionsByTenant.get(session.tenantId)?.delete(sid);

    return {
      ...session,
      status,
      revokedAt,
      updatedAt: revokedAt,
    };
  }

  async listSessionIdsByUser(userId: string): Promise<string[]> {
    return this.filterActive(this.sessionsByUser.get(userId));
  }

  async listSessionIdsByTenant(tenantId: string): Promise<string[]> {
    return this.filterActive(this.sessionsByTenant.get(tenantId));
  }

  async publishInvalidation(message: string): Promise<void> {
    this.invalidations.push(message);
    this.invalidationEvents.emit('invalidate', message);
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  refreshLookupCount(): number {
    return this.refreshLookups.size;
  }

  private addIndex(index: Map<string, Set<string>>, key: string, sid: string): void {
    const bucket = index.get(key) ?? new Set<string>();
    bucket.add(sid);
    index.set(key, bucket);
  }

  private filterActive(values?: Set<string>): string[] {
    if (!values) {
      return [];
    }

    return [...values].filter((sid) => this.sessions.has(sid));
  }
}
