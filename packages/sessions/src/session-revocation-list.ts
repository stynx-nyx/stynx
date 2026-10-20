import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { STYNX_SESSIONS_OPTIONS, STYNX_SESSION_STORE } from './tokens.js';
import type { ResolvedStynxSessionsModuleOptions, SessionStore } from './types.js';

const DEFAULT_REFRESH_INTERVAL_MS = 1000;
const DEFAULT_MAX_STALENESS_MS = 15_000;
const DEFAULT_ACCESS_SECONDS = 10 * 60;
/** Clock skew tolerated between token issuers and verifiers. */
const RETENTION_SKEW_MS = 60_000;

/**
 * In-memory list of revoked session ids, checked synchronously on the request
 * path (S-12: no session, cache, database or network read while authorizing).
 *
 * A revoked access token stays valid by signature until its `exp`, so an entry
 * is kept for the access-token TTL plus clock skew after revocation and then
 * dropped: past that point the token has expired on its own. Entries arrive in
 * two ways, both off the request path:
 *
 * - in process, when {@link SessionService} revokes a session;
 * - from the session store, which a background job reads every
 *   `revocation.refreshIntervalMs` (default 1 s), so a revocation made on another
 *   instance reaches this one within that interval.
 *
 * When the store supports {@link SessionStore.listRevokedSessions} and the last
 * successful refresh is older than `revocation.maxStalenessMs` (default 15 s),
 * {@link isStale} reports true and the guard fails closed instead of trusting a
 * list it can no longer vouch for.
 */
@Injectable()
export class SessionRevocationList implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly revoked = new Map<string, number>();
  private lastRefreshedAt: number | undefined;
  private timer: NodeJS.Timeout | undefined;
  private refreshing: Promise<void> | undefined;

  constructor(
    @Optional()
    @Inject(STYNX_SESSIONS_OPTIONS)
    private readonly options?: ResolvedStynxSessionsModuleOptions,
    @Optional()
    @Inject(STYNX_SESSION_STORE)
    private readonly store?: SessionStore,
  ) {}

  /** Synchronous, in-memory: true when `sid` was revoked and its tokens may still be live. */
  isRevoked(sid: string): boolean {
    const until = this.revoked.get(sid);
    if (until === undefined) return false;
    if (until <= this.nowMs()) {
      this.revoked.delete(sid);
      return false;
    }
    return true;
  }

  /**
   * Synchronous, in-memory: true when the list is backed by the store and has not
   * been refreshed within `maxStalenessMs`, so revocations from other instances
   * may be missing.
   */
  isStale(): boolean {
    if (!this.store?.listRevokedSessions) return false;
    if (this.lastRefreshedAt === undefined) return true;
    return this.nowMs() - this.lastRefreshedAt > this.maxStalenessMs();
  }

  /** Records a revocation made in this process. */
  add(sid: string, revokedAt: string | number = this.nowMs()): void {
    const revokedAtMs = typeof revokedAt === 'number' ? revokedAt : Date.parse(revokedAt);
    const until = (Number.isFinite(revokedAtMs) ? revokedAtMs : this.nowMs()) + this.retentionMs();
    const current = this.revoked.get(sid);
    if (current === undefined || current < until) this.revoked.set(sid, until);
  }

  /** Number of revoked session ids currently held. */
  size(): number {
    this.prune();
    return this.revoked.size;
  }

  /**
   * Reads recent revocations from the session store. Called by the background
   * job and once at application bootstrap; never by the request path.
   */
  async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const run = this.refreshFromStore();
    this.refreshing = run;
    try {
      await run;
    } finally {
      this.refreshing = undefined;
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.store?.listRevokedSessions) return;
    try {
      await this.refresh();
    } catch {
      // The list stays stale and the guard fails closed until a refresh succeeds.
    }
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.refresh().catch(() => undefined);
    }, this.refreshIntervalMs());
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async refreshFromStore(): Promise<void> {
    const store = this.store;
    if (!store?.listRevokedSessions) return;
    const startedAt = this.nowMs();
    const entries = await store.listRevokedSessions(
      new Date(startedAt - this.retentionMs()).toISOString(),
    );
    for (const entry of entries) {
      if (typeof entry?.sid === 'string' && entry.sid.length > 0) this.add(entry.sid, entry.revokedAt);
    }
    this.prune();
    this.lastRefreshedAt = startedAt;
  }

  private prune(): void {
    const now = this.nowMs();
    for (const [sid, until] of this.revoked) {
      if (until <= now) this.revoked.delete(sid);
    }
  }

  private retentionMs(): number {
    const accessSeconds = this.options?.timeouts?.accessSeconds ?? DEFAULT_ACCESS_SECONDS;
    return accessSeconds * 1000 + RETENTION_SKEW_MS;
  }

  private refreshIntervalMs(): number {
    return this.options?.revocation?.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  }

  private maxStalenessMs(): number {
    return this.options?.revocation?.maxStalenessMs ?? DEFAULT_MAX_STALENESS_MS;
  }

  private nowMs(): number {
    return Date.now();
  }
}
