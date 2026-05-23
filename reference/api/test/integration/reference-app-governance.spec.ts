import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');

type RbacInventory = {
  roles: Array<{ id: string }>;
  permissions: Array<{ id: string }>;
  bindings: {
    endpointBindings: Array<{ permissionId: string; endpointId: string }>;
    routeBindings: Array<{ permissionId: string; routeId: string }>;
    entityBindings: Array<{ permissionId: string; entity: string }>;
  };
  stats: {
    roleCount: number;
    permissionCount: number;
    endpointBindingCount: number;
    routeBindingCount: number;
    entityBindingCount: number;
  };
};

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function readReferenceRbac(): RbacInventory {
  return JSON.parse(readRepoFile('docs/arch/reference-app-rbac.json')) as RbacInventory;
}

function permissionDecoratorsFromReferenceControllers(): string[] {
  const sampleDir = resolve(repoRoot, 'reference/api/src/sample');
  return readdirSync(sampleDir)
    .filter((file) => file.endsWith('controller.ts') && file !== 'reference-dev-auth.controller.ts')
    .flatMap((file) => {
      const source = readFileSync(resolve(sampleDir, file), 'utf8');
      return [...source.matchAll(/@Permission\('([^']+)'\)/g)].map((match) => match[1] ?? '');
    })
    .filter(Boolean);
}

describe('reference app data, RBAC, and route governance artifacts', () => {
  it('keeps the authored RBAC inventory aligned with controller permission decorators', () => {
    const rbac = readReferenceRbac();
    const decoratorPermissions = permissionDecoratorsFromReferenceControllers().sort();
    const endpointBindingPermissions = rbac.bindings.endpointBindings
      .map((binding) => binding.permissionId)
      .sort();

    expect(rbac.roles.map((role) => role.id).sort()).toEqual([
      'admin',
      'member',
      'owner',
      'viewer',
    ]);
    expect(rbac.permissions.map((permission) => permission.id)).toContain('sample:record:read');
    expect(rbac.permissions.map((permission) => permission.id)).toContain(
      'sample:work-item-lock:hard-delete',
    );
    expect(rbac.permissions.map((permission) => permission.id)).toContain('flow:read:runtime');
    expect(endpointBindingPermissions).toEqual(decoratorPermissions);
    expect(rbac.stats.endpointBindingCount).toBe(rbac.bindings.endpointBindings.length);
    expect(rbac.stats.permissionCount).toBe(rbac.permissions.length);
  });

  it('keeps route bindings aligned with Angular permission guards', () => {
    const rbac = readReferenceRbac();
    const appRoutes = readRepoFile('reference/web/src/app/app.routes.ts');
    const routeGuardPermissions = [...appRoutes.matchAll(/stynxPermissionGuard\('([^']+)'\)/g)]
      .map((match) => match[1] ?? '')
      .filter(Boolean);

    expect(rbac.bindings.routeBindings.map((binding) => binding.permissionId)).toEqual(
      routeGuardPermissions,
    );
    expect(
      rbac.bindings.routeBindings.every((binding) => binding.routeId.startsWith('angular:')),
    ).toBe(true);
    expect(rbac.stats.routeBindingCount).toBe(rbac.bindings.routeBindings.length);
  });

  it('documents reference FKs, PII policy, and migration verification hooks', () => {
    const migration = readRepoFile('reference/api/migrations/0001_reference.sql');
    const appModule = readRepoFile('reference/api/src/app.module.ts');
    const dbVerify = readRepoFile('scripts/db-verify.mjs');

    expect(migration).toContain(
      'record_id     uuid        NOT NULL REFERENCES sample.record(id) ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      'work_item_id   uuid        NOT NULL REFERENCES sample.work_item(id) ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      "('sample', 'record', 'email',        'direct_pii', 'hash_with_salt',",
    );
    expect(migration).toContain("'contract', 'until_account_closure'");
    expect(appModule).toContain('core.app_schema_migrations');
    expect(appModule).toContain('runReferenceApiMigrations');
    expect(dbVerify).toContain('tenant_id tables missing RLS tenant policy');
    expect(dbVerify).toContain('audited tables missing audit trigger');
  });
});
