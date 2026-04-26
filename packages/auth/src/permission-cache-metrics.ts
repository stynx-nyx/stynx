import { Injectable } from '@nestjs/common';

export type PermissionCacheTier = 'in_memory' | 'redis' | 'db';

@Injectable()
export class PermissionCacheMetrics {
  private readonly hits = new Map<PermissionCacheTier, number>([
    ['in_memory', 0],
    ['redis', 0],
    ['db', 0],
  ]);

  increment(tier: PermissionCacheTier): void {
    this.hits.set(tier, (this.hits.get(tier) ?? 0) + 1);
  }

  snapshot(): Record<PermissionCacheTier, number> {
    return {
      in_memory: this.hits.get('in_memory') ?? 0,
      redis: this.hits.get('redis') ?? 0,
      db: this.hits.get('db') ?? 0,
    };
  }
}
