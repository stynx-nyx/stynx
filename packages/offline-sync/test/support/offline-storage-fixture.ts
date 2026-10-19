import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect } from 'vitest';
import {
  renderOfflineStorage,
  verifyOfflineStorage,
  type OfflineStorageOptions,
} from '../../src/storage.js';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres.js';

export interface OfflineStorageFixture {
  postgres: PostgresTestDatabase;
  admin: Client;
  options: OfflineStorageOptions;
  roles: string[];
  tenants: [string, string];
}
export async function fixture(
  reader = true,
  tenantSchema = 'auth',
): Promise<OfflineStorageFixture> {
  const postgres = await createPostgresTestDatabase('stynx_offline_storage', {
    useTemplate: false,
  });
  const admin = await postgres.connectAsAdmin();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const options = {
    ownerRole: `ofs_owner_${suffix}`,
    appRole: `ofs_app_${suffix}`,
    readerRole: reader ? `ofs_reader_${suffix}` : null,
    tenantTable: { schema: tenantSchema, table: 'tenants', column: 'tenant_uuid' },
  };
  const roles = [
    options.ownerRole,
    options.appRole,
    ...(options.readerRole ? [options.readerRole] : []),
  ];
  const tenants: [string, string] = [randomUUID(), randomUUID()];
  try {
    await admin.query(
      `create role ${admin.escapeIdentifier(options.ownerRole)} nosuperuser bypassrls noinherit`,
    );
    await admin.query(
      `create role ${admin.escapeIdentifier(options.appRole)} login nosuperuser nobypassrls noinherit`,
    );
    if (options.readerRole)
      await admin.query(
        `create role ${admin.escapeIdentifier(options.readerRole)} nosuperuser nobypassrls noinherit`,
      );
    await postgres.ensureRoleLogin(options.appRole);
    await admin.query(
      `grant connect,create on database ${admin.escapeIdentifier(postgres.database)} to ${admin.escapeIdentifier(options.ownerRole)}`,
    );
    await admin.query(`begin;set local role ${admin.escapeIdentifier(options.ownerRole)}`);
    await admin.query(
      `create schema ${admin.escapeIdentifier(tenantSchema)}; create table ${admin.escapeIdentifier(tenantSchema)}.tenants(tenant_uuid uuid primary key)`,
    );
    await admin.query(
      `insert into ${admin.escapeIdentifier(tenantSchema)}.tenants values ($1),($2)`,
      tenants,
    );
    const artifact = renderOfflineStorage(options);
    await admin.query(artifact.objectsSql);
    await admin.query(artifact.roleBindingsSql);
    await admin.query('commit');
    return { postgres, admin, options, roles, tenants };
  } catch (error) {
    await admin.query('rollback').catch(() => undefined);
    for (const role of roles) {
      await admin
        .query(`drop owned by ${admin.escapeIdentifier(role)} cascade`)
        .catch(() => undefined);
      await admin
        .query(`drop role if exists ${admin.escapeIdentifier(role)}`)
        .catch(() => undefined);
    }
    await admin.end();
    await postgres.dispose();
    throw error;
  }
}
export async function dispose(value: OfflineStorageFixture) {
  await value.admin.query('rollback');
  await value.admin.query('reset role');
  for (const role of value.roles) {
    await value.admin.query(`drop owned by ${value.admin.escapeIdentifier(role)} cascade`);
    await value.admin.query(`drop role ${value.admin.escapeIdentifier(role)}`);
  }
  await value.admin.end();
  await value.postgres.dispose();
}
export async function verify(
  value: OfflineStorageFixture,
  { readonly = true, role = value.options.ownerRole! } = {},
) {
  await value.admin.query(`begin ${readonly ? 'read only' : 'read write'}`);
  try {
    await value.admin.query(`set local role ${value.admin.escapeIdentifier(role)}`);
    return await verifyOfflineStorage(value.admin, value.options);
  } finally {
    await value.admin.query('rollback');
  }
}
export async function baseline(value: OfflineStorageFixture) {
  const report = await verify(value);
  expect(
    report.supported,
    JSON.stringify(report.checks.filter((check) => check.status !== 'pass')),
  ).toBe(true);
  expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
  return report;
}
