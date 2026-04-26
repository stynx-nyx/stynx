import type { PermissionCacheBackend, PermissionCacheRecord } from './types';

export class InMemoryPermissionCacheBackend implements PermissionCacheBackend {
  private readonly records = new Map<string, PermissionCacheRecord>();
  private readonly byUser = new Map<string, Set<string>>();
  private readonly byTenant = new Map<string, Set<string>>();
  private subscriber?: (message: string) => Promise<void>;

  async get(sid: string): Promise<PermissionCacheRecord | null> {
    return this.records.get(sid) ?? null;
  }

  async set(record: PermissionCacheRecord): Promise<void> {
    this.records.set(record.sid, { ...record, permissions: [...record.permissions] });
    this.addIndex(this.byUser, record.userId, record.sid);
    this.addIndex(this.byTenant, record.tenantId, record.sid);
  }

  async delete(sid: string): Promise<void> {
    const record = this.records.get(sid);
    if (!record) {
      return;
    }
    this.records.delete(sid);
    this.byUser.get(record.userId)?.delete(sid);
    this.byTenant.get(record.tenantId)?.delete(sid);
  }

  async invalidateScope(message: string): Promise<void> {
    const [userId, tenantId] = message.split(':');
    if (!userId || !tenantId) {
      return;
    }

    if (userId === '*' && tenantId === '*') {
      await Promise.all([...this.records.keys()].map((sid) => this.delete(sid)));
      return;
    }

    if (userId === '*') {
      await Promise.all([...(this.byTenant.get(tenantId) ?? [])].map((sid) => this.delete(sid)));
      return;
    }

    const candidates = [...(this.byUser.get(userId) ?? [])];
    await Promise.all(
      candidates.map(async (sid) => {
        const record = this.records.get(sid);
        if (record && record.tenantId === tenantId) {
          await this.delete(sid);
        }
      }),
    );
  }

  async subscribe(onMessage: (message: string) => Promise<void>): Promise<void> {
    this.subscriber = onMessage;
  }

  async publish(message: string): Promise<void> {
    if (this.subscriber) {
      await this.subscriber(message);
    }
  }

  async close(): Promise<void> {
    this.records.clear();
    this.byUser.clear();
    this.byTenant.clear();
  }

  private addIndex(index: Map<string, Set<string>>, key: string, sid: string): void {
    const bucket = index.get(key) ?? new Set<string>();
    bucket.add(sid);
    index.set(key, bucket);
  }
}
