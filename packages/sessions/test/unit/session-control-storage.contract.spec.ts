import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PostgresSessionRegistry, type SessionControlCapabilities } from '../../src/control';

const migration = readFileSync(
  resolve(__dirname, '../../../../reference/api/migrations/0004_session_control.sql'),
  'utf8',
);
const capabilities: SessionControlCapabilities = {
  stableSessionIdentity: false,
  listScopes: ['tenant'],
  controlScopes: ['tenant'],
  revokeOne: true,
  revokeOthers: true,
  revokeAll: true,
  localEnforcement: 'none',
  providerConfirmation: true,
  retryReconciliation: true,
  identityGlobalAuthority: false,
  sharedAnchorBlastRadius: true,
};

describe('R21 durable session registry contract', () => {
  it('defines all four tables, forced tenant RLS, tenant-leading indexes, enum checks, and no public grants', () => {
    for (const table of [
      'session_provider_anchors',
      'session_registrations',
      'session_operations',
      'session_operation_attempts',
    ]) expect(migration).toContain(`auth.${table}`);
    for (const table of ['session_registrations', 'session_operations', 'session_operation_attempts']) {
      expect(migration).toContain(`ALTER TABLE auth.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE auth.${table} FORCE ROW LEVEL SECURITY`);
      expect(migration).toMatch(new RegExp(`CREATE POLICY [\\s\\S]*? ON auth\\.${table}[\\s\\S]*?current_setting\\('app\\.tenant_id'`));
    }
    expect(migration).toContain('(tenant_id, subject_id, state, last_seen_at DESC)');
    expect(migration).toContain('(tenant_id, sid)');
    expect(migration).toContain('(tenant_id, terminal_at)');
    expect(migration).toContain('(tenant_id, state, next_attempt_at)');
    expect(migration).toContain('REVOKE ALL ON auth.session_provider_anchors FROM PUBLIC');
    expect(migration).not.toMatch(/(?:raw_)?(?:access|refresh|id)_token\s+(?:text|bytea)|raw_ip|full_user_agent/i);
  });

  it('never sends a raw token through anchor provisioning and enforces exactly one opaque correlation form', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const database = { tx: (fn: (trx: { query: typeof query }) => unknown) => fn({ query }) };
    const registry = new PostgresSessionRegistry(database as never);
    await expect(registry.provisionAnchor({
      id: '00000000-0000-4000-8000-000000000001',
      provider: 'fixture',
      providerSubjectKey: 'subject-key',
      capabilities,
    })).rejects.toThrow('Exactly one opaque provider correlation value is required');
    await expect(registry.provisionAnchor({
      id: '00000000-0000-4000-8000-000000000001',
      provider: 'fixture',
      providerSubjectKey: 'subject-key',
      keyedFingerprint: new Uint8Array([1]),
      encryptedHandle: new Uint8Array([2]),
      capabilities,
    })).rejects.toThrow('Exactly one opaque provider correlation value is required');
    await registry.provisionAnchor({
      id: '00000000-0000-4000-8000-000000000001',
      provider: 'fixture',
      providerSubjectKey: 'subject-key',
      keyedFingerprint: new Uint8Array([1, 2, 3]),
      capabilities,
    });
    expect(JSON.stringify(query.mock.calls)).not.toMatch(/access.?token|refresh.?token|id.?token/i);
  });

  it('uses skip-locked atomic leasing and tenant-scoped reads/deletes', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const database = { tx: (fn: (trx: { query: typeof query }) => unknown) => fn({ query }) };
    const registry = new PostgresSessionRegistry(database as never);
    await registry.claimPending('2026-07-13T00:00:00.000Z', '2026-07-13T00:01:00.000Z', 25);
    await registry.eraseSubject('00000000-0000-4000-8000-000000000001', 'subject-a');
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('tenant_id=$1::uuid and subject_id=$2');
  });

  it('records each provider attempt append-only with the operation state change', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const database = { tx: (fn: (trx: { query: typeof query }) => unknown) => fn({ query }) };
    const registry = new PostgresSessionRegistry(database as never);
    await registry.saveOperation({
      key: 'tenant:subject-a:revoke-one:00000000-0000-4000-8000-000000000021',
      requestHash: 'a'.repeat(64),
      result: {
        operationId: '00000000-0000-4000-8000-000000000021',
        action: 'revoke-one',
        scope: 'tenant',
        status: 'pending',
        guarantee: { kind: 'none', effectiveBy: null, propagationBoundSeconds: null, accessTokenExpiresAt: null },
        effectiveBy: null,
        results: [],
      },
      attempts: 1,
      nextAttemptAt: '2026-07-13T00:00:05.000Z',
      leaseUntil: null,
    });
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).toContain('insert into auth.session_operation_attempts');
  });
});
