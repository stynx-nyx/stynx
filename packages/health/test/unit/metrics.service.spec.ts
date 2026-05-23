import { StynxMetricsService } from '../../src/metrics.service';

describe('StynxMetricsService', () => {
  it('renders baseline prometheus metrics', async () => {
    const metrics = new StynxMetricsService();
    const output = await metrics.render();

    expect(output).toContain('http_request_total');
    expect(output).toContain('session_active_total');
  });

  it('exposes the expected prometheus label contracts', () => {
    const metrics = new StynxMetricsService();
    const httpLabels = ['method', 'route', 'status', 'tenant_tier'];
    const poolLabels = ['role'];
    const tableLabels = ['table'];

    expect(metrics.httpRequestDuration.labelNames).toEqual(httpLabels);
    expect(metrics.httpRequestTotal.labelNames).toEqual(httpLabels);
    expect(metrics.httpRequestsTotal.labelNames).toEqual(httpLabels);
    expect(metrics.dbQueryDuration.labelNames).toEqual(['op']);
    expect(metrics.auditEventsTotal.labelNames).toEqual(['entity', 'operation']);
    expect(metrics.dbPoolInUse.labelNames).toEqual(poolLabels);
    expect(metrics.dbPoolIdle.labelNames).toEqual(poolLabels);
    expect(metrics.dbPoolWaiting.labelNames).toEqual(poolLabels);
    expect(metrics.authzDenyTotal.labelNames).toEqual(['reason']);
    expect(metrics.rateLimitBlockTotal.labelNames).toEqual(['scope']);
    expect(metrics.idempotencyReplayTotal.labelNames).toEqual([]);
    expect(metrics.storagePresignTotal.labelNames).toEqual(['op']);
    expect(metrics.softDeleteTotal.labelNames).toEqual(tableLabels);
    expect(metrics.hardDeleteTotal.labelNames).toEqual(tableLabels);
    expect(metrics.restoreTotal.labelNames).toEqual(tableLabels);
    expect(metrics.lgpdErasureTotal.labelNames).toEqual(['table', 'strategy']);
    expect(metrics.archiveSizeBytes.labelNames).toEqual(tableLabels);
    expect(metrics.sessionActiveTotal.labelNames).toEqual([]);
  });

  it('registers every package metric on the service registry', () => {
    const metrics = new StynxMetricsService();
    const registeredMetrics = {
      archive_size_bytes: metrics.archiveSizeBytes,
      audit_events_total: metrics.auditEventsTotal,
      authz_deny_total: metrics.authzDenyTotal,
      db_pool_idle: metrics.dbPoolIdle,
      db_pool_in_use: metrics.dbPoolInUse,
      db_pool_waiting: metrics.dbPoolWaiting,
      db_query_duration_seconds: metrics.dbQueryDuration,
      hard_delete_total: metrics.hardDeleteTotal,
      http_request_duration_seconds: metrics.httpRequestDuration,
      http_request_total: metrics.httpRequestTotal,
      http_requests_total: metrics.httpRequestsTotal,
      idempotency_replay_total: metrics.idempotencyReplayTotal,
      lgpd_erasure_total: metrics.lgpdErasureTotal,
      ratelimit_block_total: metrics.rateLimitBlockTotal,
      restore_total: metrics.restoreTotal,
      session_active_total: metrics.sessionActiveTotal,
      soft_delete_total: metrics.softDeleteTotal,
      storage_presign_total: metrics.storagePresignTotal,
    };

    for (const [name, metric] of Object.entries(registeredMetrics)) {
      expect(metrics.registry.getSingleMetric(name)).toBe(metric);
    }
  });

  it('initializes pool gauges for all connection roles and the active session gauge', async () => {
    const metrics = new StynxMetricsService();
    const output = await metrics.render();

    for (const role of ['app', 'reader', 'owner']) {
      expect(output).toContain(`db_pool_in_use{role="${role}"} 0`);
      expect(output).toContain(`db_pool_idle{role="${role}"} 0`);
      expect(output).toContain(`db_pool_waiting{role="${role}"} 0`);
    }
    expect(output).toContain('session_active_total 0');
  });
});
