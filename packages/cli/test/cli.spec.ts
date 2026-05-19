import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  adoptApply,
  adoptApplyProposedPermissions,
  adoptScan,
  formatAdoptScanHuman,
  linkCognitoUsers,
} from '../src/adopt';
import { verifyAuditChain } from '../src/audit';
import { runDoctor } from '../src/doctor';
import { scaffoldApp } from '../src/init';
import { generateRopaFromApp } from '../src/privacy-ropa';

const proposedPermissionPlaceholder = 'TODO' + '_PERMISSION';

describe('@stynx/cli', () => {
  it('scaffolds a consumer app skeleton', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-init-'));
    scaffoldApp(resolve(root, 'demo-app'), 'demo-app', true);

    expect(readFileSync(resolve(root, 'demo-app/package.json'), 'utf8')).toContain('"name": "demo-app"');
    expect(readFileSync(resolve(root, 'demo-app/angular.json'), 'utf8')).toContain('"version": 1');
    expect(readFileSync(resolve(root, 'demo-app/migrations/0001_init.sql'), 'utf8')).toContain('create_soft_deletable_table');
  });

  it('scaffolds without Angular files when angular=false', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-init-api-'));
    scaffoldApp(resolve(root, 'api-app'), 'api-app');

    expect(readFileSync(resolve(root, 'api-app/package.json'), 'utf8')).toContain('"name": "api-app"');
    expect(() => readFileSync(resolve(root, 'api-app/angular.json'), 'utf8')).toThrow();
  });

  it('runs doctor against a fixture directory', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-doctor-'));
    mkdirSync(resolve(root, 'scripts'), { recursive: true });
    writeFileSync(resolve(root, 'scripts/stynx-doctor.mjs'), "console.log('[doctor][ok] fixture'); process.exit(0);\n", 'utf8');
    const result = runDoctor(root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[doctor][ok]');
  });

  it('reports doctor spawn failures with fallback exit code and empty output strings', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-doctor-missing-'));
    const result = runDoctor(root);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(typeof result.stderr).toBe('string');
  });

  it('generates ROPA markdown from privacy yaml', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-ropa-'));
    mkdirSync(resolve(root, 'app/privacy'), { recursive: true });
    writeFileSync(resolve(root, 'app/privacy/pii-map.yaml'), 'rules:\n  - tableSchema: auth\n    tableName: users\n    columnName: email\n    strategy: nullify\n    subjectColumn: id\n', 'utf8');
    expect(generateRopaFromApp(root)).toContain('auth.users');
  });

  it('generates empty and retention-aware ROPA markdown', () => {
    const missing = mkdtempSync(resolve(tmpdir(), 'stynx-cli-ropa-missing-'));
    expect(generateRopaFromApp(missing)).toContain('| Table | Column | Strategy |');

    const empty = mkdtempSync(resolve(tmpdir(), 'stynx-cli-ropa-empty-'));
    mkdirSync(resolve(empty, 'app/privacy'), { recursive: true });
    writeFileSync(resolve(empty, 'app/privacy/pii-map.yaml'), '{}\n', 'utf8');
    expect(generateRopaFromApp(empty)).toContain('| Table | Column | Strategy |');

    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-ropa-retention-'));
    mkdirSync(resolve(root, 'app/privacy'), { recursive: true });
    writeFileSync(
      resolve(root, 'app/privacy/pii-map.yaml'),
      'rules:\n  - tableSchema: audit\n    tableName: events\n    columnName: payload\n    strategy: redact\n    retention:\n      timestampColumn: occurred_at\n      olderThanDays: 365\n    notes: redact payload fields\n',
      'utf8',
    );
    const markdown = generateRopaFromApp(root);
    expect(markdown).toContain('both 365d via occurred_at');
    expect(markdown).toContain('redact payload fields');
  });

  it('scans and applies the neutral adoption fixture with richer outputs', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-adoption-'));
    cpSync(resolve(__dirname, 'fixtures/adoption-fixture'), root, { recursive: true });

    const report = adoptScan(root);
    expect(report.invariants.rawDbConnection.callSites.length).toBeGreaterThanOrEqual(1);
    expect(report.invariants.routePermissions.length).toBe(4);
    expect(report.invariants.tenancy.organizationIdTables).toContain('resource_record');
    expect(report.authLayer.customJwtMiddleware).toContain('src/auth.middleware.ts');
    expect(formatAdoptScanHuman(report)).toContain('I8');

    const applyResult = adoptApply(root, false);
    expect(applyResult.generatedFiles).toContain('generated/stynx-adopt/schema.ts');
    expect(readFileSync(resolve(root, 'src/records/records.controller.ts'), 'utf8')).toContain(proposedPermissionPlaceholder);
    expect(readFileSync(resolve(root, 'generated/stynx-adopt/schema.ts'), 'utf8')).toContain('export const resourceRecord');
    expect(readFileSync(resolve(root, 'generated/stynx-adopt/migrations/0001_stynx_adopt_resource_record.sql'), 'utf8')).toContain('adopt_soft_deletable_table');

    const replaced = adoptApplyProposedPermissions(root, {
      [proposedPermissionPlaceholder]: 'resource_record:write:*',
    });
    expect(replaced).toBeGreaterThanOrEqual(1);
    expect(readFileSync(resolve(root, 'src/records/records.controller.ts'), 'utf8')).toContain('resource_record:write:*');
  });

  it('matches cognito users by email', () => {
    const result = linkCognitoUsers(
      [
        { id: 'u1', email: 'a@example.com' },
        { id: 'u2', email: 'b@example.com' },
      ],
      [
        { sub: 'sub-a', email: 'a@example.com' },
      ],
    );
    expect(result.matched).toEqual([{ userId: 'u1', email: 'a@example.com', cognitoSub: 'sub-a' }]);
    expect(result.unmatched).toEqual([{ userId: 'u2', email: 'b@example.com' }]);
  });

  it('verifies audit hash chains across tenants', async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      async connect(): Promise<void> {},
      async end(): Promise<void> {},
      async query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        calls.push({ sql, values });
        if (sql.includes('distinct tenancy_id')) {
          return {
            rows: [
              { tenant_id: '01990000-0000-7000-8000-000000000001' },
              { tenant_id: '01990000-0000-7000-8000-000000000002' },
            ] as T[],
          };
        }
        if (values?.[0] === '01990000-0000-7000-8000-000000000002') {
          return {
            rows: [
              { event_id: '01990000-0000-7000-8000-000000000102', chain_valid: false },
            ] as T[],
          };
        }
        return {
          rows: [
            { event_id: '01990000-0000-7000-8000-000000000101', chain_valid: true },
          ] as T[],
        };
      },
    };

    await expect(verifyAuditChain('postgres://fixture', {
      clientFactory: () => client,
      limit: 50,
    })).resolves.toEqual({
      valid: false,
      totalChecked: 2,
      tenants: [
        {
          tenantId: '01990000-0000-7000-8000-000000000001',
          valid: true,
          totalChecked: 1,
        },
        {
          tenantId: '01990000-0000-7000-8000-000000000002',
          valid: false,
          totalChecked: 1,
          firstBrokenEventId: '01990000-0000-7000-8000-000000000102',
        },
      ],
    });
    expect(calls[1]?.values).toEqual(['01990000-0000-7000-8000-000000000001', 50]);
  });

  it('verifies one audit tenant, clamps invalid limits, and always closes the client', async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    let ended = false;
    const client = {
      async connect(): Promise<void> {},
      async end(): Promise<void> {
        ended = true;
      },
      async query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        calls.push({ sql, values });
        return { rows: [{ event_id: 'event-1', chain_valid: true }] as T[] };
      },
    };

    await expect(verifyAuditChain('postgres://fixture', {
      tenantId: '01990000-0000-7000-8000-000000000001',
      limit: -1,
      clientFactory: () => client,
    })).resolves.toMatchObject({
      valid: true,
      totalChecked: 1,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.values).toEqual(['01990000-0000-7000-8000-000000000001', 1000]);
    expect(ended).toBe(true);
  });

  it('clamps audit limits above the maximum', async () => {
    const client = {
      async connect(): Promise<void> {},
      async end(): Promise<void> {},
      async query<T>(_sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        expect(values?.[1]).toBe(10_000);
        return { rows: [] };
      },
    };

    await expect(verifyAuditChain('postgres://fixture', {
      tenantId: '01990000-0000-7000-8000-000000000001',
      limit: 50_001.9,
      clientFactory: () => client,
    })).resolves.toMatchObject({ valid: true, totalChecked: 0 });
  });
});
