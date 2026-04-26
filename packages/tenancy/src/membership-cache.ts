interface MembershipCacheEntry {
  allowed: boolean;
  expiresAt: number;
}

export class MembershipAccessCache {
  private readonly entries = new Map<string, MembershipCacheEntry>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(userId: string, tenantId: string): boolean | undefined {
    const key = this.key(userId, tenantId);
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.allowed;
  }

  set(userId: string, tenantId: string, allowed: boolean): void {
    const key = this.key(userId, tenantId);
    this.entries.delete(key);
    this.entries.set(key, {
      allowed,
      expiresAt: Date.now() + this.ttlMs,
    });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) {
        break;
      }
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  invalidateTenant(tenantId: string): void {
    for (const key of this.entries.keys()) {
      if (key.endsWith(`:${tenantId}`)) {
        this.entries.delete(key);
      }
    }
  }

  private key(userId: string, tenantId: string): string {
    return `${userId}:${tenantId}`;
  }
}
