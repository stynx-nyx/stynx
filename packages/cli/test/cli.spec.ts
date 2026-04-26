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

  it('runs doctor against a fixture directory', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-doctor-'));
    mkdirSync(resolve(root, 'scripts'), { recursive: true });
    writeFileSync(resolve(root, 'scripts/stynx-doctor.mjs'), "console.log('[doctor][ok] fixture'); process.exit(0);\n", 'utf8');
    const result = runDoctor(root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[doctor][ok]');
  });

  it('generates ROPA markdown from privacy yaml', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-ropa-'));
    mkdirSync(resolve(root, 'app/privacy'), { recursive: true });
    writeFileSync(resolve(root, 'app/privacy/pii-map.yaml'), 'rules:\n  - tableSchema: auth\n    tableName: users\n    columnName: email\n    strategy: nullify\n    subjectColumn: id\n', 'utf8');
    expect(generateRopaFromApp(root)).toContain('auth.users');
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
});
