import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  adoptApply,
  adoptApplyProposedPermissions,
  adoptScan,
  formatAdoptScanHuman,
} from '../src/adopt';

describe('adopt command family', () => {
  it('is idempotent on the fixture repo', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-adopt-fixture-'));
    cpSync(resolve(__dirname, 'fixtures/adoption-fixture'), root, { recursive: true });
    const before = adoptScan(root);
    expect(before.invariants.routePermissions).toHaveLength(4);
    const first = adoptApply(root, false);
    const second = adoptApply(root, false);
    expect(first.changedFiles.length).toBeGreaterThanOrEqual(3);
    expect(second.changedFiles).toHaveLength(0);
    expect(readFileSync(resolve(root, 'src/auth.middleware.ts'), 'utf8')).toContain('DEPRECATED in favor of @stynx/auth');
  });

  it('handles clean reports, skipped directories, dry-runs, and mixed schema generation', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-adopt-branches-'));
    mkdirSync(resolve(root, 'src'), { recursive: true });
    mkdirSync(resolve(root, 'migrations'), { recursive: true });
    mkdirSync(resolve(root, 'node_modules/ignored'), { recursive: true });
    writeFileSync(resolve(root, 'node_modules/ignored/noise.ts'), '@Get() ignored() {}\n', 'utf8');
    writeFileSync(resolve(root, 'src/routes.ts'), [
      '@Get()',
      'async rootList() {}',
      "import { Public } from '@stynx/auth';",
      '@Public()',
      '@Get()',
      'async listReports() {}',
      '@Post()',
      'createThing() {}',
      '@Public()',
      '@Patch()',
      'updateThing() {}',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(resolve(root, 'src/worker.ts'), "const client = new Client();\nclient.query('select 1');\n", 'utf8');
    writeFileSync(resolve(root, 'migrations/001.sql'), [
      'create table plain_table (',
      '  id uuid primary key,',
      '  name text not null,',
      '  created_at timestamptz,',
      '  enabled boolean,',
      '  constraint plain_table_pk primary key (id),',
      '  malformed',
      ');',
      'create table tenant_records (',
      '  id uuid primary key,',
      '  tenant_id uuid not null,',
      '  deleted boolean,',
      '  created_at timestamptz',
      ');',
      'create table org_records (',
      '  id uuid primary key,',
      '  organization_id uuid not null,',
      '  name text',
      ');',
      'create table event_log (',
      '  id uuid primary key,',
      '  tenant_id uuid not null',
      ');',
      'alter table tenant_records enable row level security;',
      "select audit.enable_for('tenant_records');",
      'create table archive.tenant_records (id uuid);',
    ].join('\n'), 'utf8');

    const report = adoptScan(root);
    expect(report.nodeFiles).toBe(2);
    expect(report.invariants.routePermissions).toEqual([
      { file: 'src/routes.ts', method: 'GET', handler: 'rootList' },
      { file: 'src/routes.ts', method: 'POST', handler: 'createThing' },
    ]);
    expect(report.invariants.tenancy.organizationIdTables).toContain('org_records');
    expect(report.invariants.softDelete.adHocSoftDeleteTables).toContain('tenant_records');
    expect(formatAdoptScanHuman({
      ...report,
      invariants: {
        rawDbConnection: { callSites: [], pgImports: [] },
        routePermissions: [],
        tenancy: { organizationIdTables: [], missingRlsTables: [] },
        audit: { missingAuditTables: [] },
        softDelete: { missingArchiveTables: [], adHocSoftDeleteTables: [] },
      },
    })).toContain('✓ none');

    const dryRun = adoptApply(root, true);
    expect(dryRun.changedFiles).toEqual(['src/routes.ts', 'src/worker.ts']);
    expect(readFileSync(resolve(root, 'src/routes.ts'), 'utf8')).not.toContain('import { Public, TODO_PERMISSION }');

    const applied = adoptApply(root);
    expect(applied.generatedFiles).toContain('generated/stynx-adopt/migrations/0002_stynx_adopt_org_records.sql');
    expect(readFileSync(resolve(root, 'generated/stynx-adopt/schema.ts'), 'utf8')).toContain("boolean('deleted')");
    expect(readFileSync(resolve(root, 'generated/stynx-adopt/schema.ts'), 'utf8')).toContain("uuid('id').primaryKey()");
    expect(readFileSync(resolve(root, 'generated/stynx-adopt/schema.ts'), 'utf8')).toContain("text('name').notNull()");
    expect(readFileSync(resolve(root, 'generated/stynx-adopt/migrations/0002_stynx_adopt_org_records.sql'), 'utf8')).toContain('RENAME COLUMN organization_id TO tenant_id');
    expect(adoptApplyProposedPermissions(root, { DOES_NOT_EXIST: 'x' })).toBe(0);
  });
});
