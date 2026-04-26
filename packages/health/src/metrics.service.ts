import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class StynxMetricsService {
  readonly registry = new Registry();
  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status', 'tenant_tier'] as const,
    registers: [this.registry],
  });
  readonly httpRequestTotal = new Counter({
    name: 'http_request_total',
    help: 'HTTP request count',
    labelNames: ['method', 'route', 'status', 'tenant_tier'] as const,
    registers: [this.registry],
  });
  readonly dbPoolInUse = new Gauge({
    name: 'db_pool_in_use',
    help: 'Database pool in use',
    labelNames: ['role'] as const,
    registers: [this.registry],
  });
  readonly dbPoolIdle = new Gauge({
    name: 'db_pool_idle',
    help: 'Database pool idle',
    labelNames: ['role'] as const,
    registers: [this.registry],
  });
  readonly dbPoolWaiting = new Gauge({
    name: 'db_pool_waiting',
    help: 'Database pool waiting',
    labelNames: ['role'] as const,
    registers: [this.registry],
  });
  readonly authzDenyTotal = new Counter({
    name: 'authz_deny_total',
    help: 'Authorization denials',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });
  readonly rateLimitBlockTotal = new Counter({
    name: 'ratelimit_block_total',
    help: 'Rate limit blocks',
    labelNames: ['scope'] as const,
    registers: [this.registry],
  });
  readonly idempotencyReplayTotal = new Counter({
    name: 'idempotency_replay_total',
    help: 'Idempotency replays',
    registers: [this.registry],
  });
  readonly storagePresignTotal = new Counter({
    name: 'storage_presign_total',
    help: 'Storage presign requests',
    labelNames: ['op'] as const,
    registers: [this.registry],
  });
  readonly softDeleteTotal = new Counter({
    name: 'soft_delete_total',
    help: 'Soft deletes',
    labelNames: ['table'] as const,
    registers: [this.registry],
  });
  readonly hardDeleteTotal = new Counter({
    name: 'hard_delete_total',
    help: 'Hard deletes',
    labelNames: ['table'] as const,
    registers: [this.registry],
  });
  readonly restoreTotal = new Counter({
    name: 'restore_total',
    help: 'Restores',
    labelNames: ['table'] as const,
    registers: [this.registry],
  });
  readonly lgpdErasureTotal = new Counter({
    name: 'lgpd_erasure_total',
    help: 'LGPD erasures',
    labelNames: ['table', 'strategy'] as const,
    registers: [this.registry],
  });
  readonly archiveSizeBytes = new Gauge({
    name: 'archive_size_bytes',
    help: 'Archive relation sizes',
    labelNames: ['table'] as const,
    registers: [this.registry],
  });
  readonly sessionActiveTotal = new Gauge({
    name: 'session_active_total',
    help: 'Active sessions',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
    for (const role of ['app', 'reader', 'owner']) {
      this.dbPoolInUse.labels(role).set(0);
      this.dbPoolIdle.labels(role).set(0);
      this.dbPoolWaiting.labels(role).set(0);
    }
    this.sessionActiveTotal.set(0);
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
