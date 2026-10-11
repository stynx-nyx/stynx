import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { types } from 'node:util';
import { Injectable } from '@nestjs/common';
import { createStynxPgClient, Database } from '@stynx-nyx/data';
import type { OfflineSyncAgentResolver, TrustedOfflineSyncScope } from '@stynx-nyx/offline-sync';

const purpose = 'stynx-http-reference-offline-agent';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
interface AgentBinding {
  purpose: typeof purpose;
  schemaVersion: 1;
  fixtureId: string;
  tenantId: string;
  actorId: string;
  agentId: string;
}
let context: { fixtureId: string; secret: string; databaseUrl: string } | undefined;

function plain(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      return typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    })
  );
}
function refuse(): never {
  throw new Error('Authenticated reference offline agent binding refused');
}
function fixture() {
  const current = {
    fixtureId: process.env.STYNX_HTTP_FIXTURE_ID ?? '',
    secret: process.env.STYNX_HTTP_AGENT_BINDING_KEY ?? '',
    databaseUrl: process.env.STYNX_APP_DATABASE_URL ?? '',
  };
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.STYNX_ENVIRONMENT !== 'http-fixture' ||
    !uuid.test(current.fixtureId) ||
    !/^[0-9a-f]{64}$/u.test(current.secret)
  )
    refuse();
  const uri = new URL(current.databaseUrl);
  if (
    uri.protocol !== 'postgresql:' ||
    uri.hostname !== '127.0.0.1' ||
    uri.username !== 'stynx_app' ||
    !uri.password ||
    !uri.port ||
    uri.search ||
    uri.hash
  )
    refuse();
  context ??= current;
  if (
    Object.keys(current).some(
      (key) => current[key as keyof typeof current] !== context![key as keyof typeof current],
    )
  )
    refuse();
  return context;
}
function validateScope(scope: TrustedOfflineSyncScope): void {
  if (
    !plain(scope) ||
    Object.keys(scope).length !== 2 ||
    !Object.hasOwn(scope, 'tenantId') ||
    !Object.hasOwn(scope, 'actorId') ||
    typeof scope.tenantId !== 'string' ||
    typeof scope.actorId !== 'string' ||
    !uuid.test(scope.tenantId) ||
    !uuid.test(scope.actorId)
  )
    refuse();
}
function binding(scope: TrustedOfflineSyncScope, agentId: string): AgentBinding {
  validateScope(scope);
  if (typeof agentId !== 'string' || !uuid.test(agentId) || agentId === scope.actorId) refuse();
  return {
    purpose,
    schemaVersion: 1,
    fixtureId: fixture().fixtureId,
    tenantId: scope.tenantId,
    actorId: scope.actorId,
    agentId,
  };
}
function canonical(value: AgentBinding) {
  // A closed positional encoding has one unambiguous representation, with no attacker-selected keys.
  return JSON.stringify([
    value.purpose,
    value.schemaVersion,
    value.fixtureId,
    value.tenantId,
    value.actorId,
    value.agentId,
  ]);
}
function key(scope: TrustedOfflineSyncScope) {
  return `${purpose}:${fixture().fixtureId}:${scope.tenantId}:${scope.actorId}`;
}
function mac(value: AgentBinding) {
  return createHmac('sha256', Buffer.from(fixture().secret, 'hex'))
    .update(canonical(value))
    .digest();
}
function verify(value: unknown, scope: TrustedOfflineSyncScope): AgentBinding {
  if (
    !plain(value) ||
    Object.keys(value).length !== 7 ||
    Object.keys(value).some(
      (name) =>
        ![
          'purpose',
          'schemaVersion',
          'fixtureId',
          'tenantId',
          'actorId',
          'agentId',
          'mac',
        ].includes(name),
    ) ||
    typeof value.agentId !== 'string' ||
    typeof value.mac !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.mac)
  )
    refuse();
  const expected = binding(scope, value.agentId);
  if (Object.keys(expected).some((name) => value[name] !== expected[name as keyof AgentBinding]))
    refuse();
  const received = Buffer.from(value.mac, 'hex');
  const wanted = mac(expected);
  if (received.length !== wanted.length || !timingSafeEqual(received, wanted)) refuse();
  return expected;
}

/** Server-owned synthetic fixture preparation; never exposed as an HTTP operation. */
@Injectable()
export class OfflineReferenceAgentBindings {
  constructor(private readonly database: Database) {}
  async prepare(
    scope: TrustedOfflineSyncScope,
    agentId: string,
  ): Promise<{
    fixtureId: string;
    tenantId: string;
    actorId: string;
    agentId: string;
    keySha256: string;
  }> {
    const row = binding(scope, agentId);
    const value = { ...row, mac: mac(row).toString('hex') };
    await this.database.withSystemContext(
      'Prepare authenticated synthetic reference business-agent binding',
      () =>
        this.database.txIndependent(
          async (trx) => {
            const role = await trx.query<{ role: string }>('select current_user::text as role');
            if (role.rows.length !== 1 || role.rows[0]!.role !== 'stynx_owner') refuse();
            await trx.query(
              `insert into core.config(key,tenant_id,value) values($1,$2,$3::jsonb)
          on conflict(key) do nothing`,
              [key(scope), scope.tenantId, JSON.stringify(value)],
            );
            const stored = await trx.query<{ value: unknown; tenant_id: string }>(
              'select value, tenant_id::text from core.config where key=$1',
              [key(scope)],
            );
            if (
              stored.rows.length !== 1 ||
              stored.rows[0]!.tenant_id !== scope.tenantId ||
              verify(stored.rows[0]!.value, scope).agentId !== agentId
            )
              refuse();
          },
          { role: 'owner', retry: false },
        ),
    );
    return {
      fixtureId: row.fixtureId,
      tenantId: row.tenantId,
      actorId: row.actorId,
      agentId,
      keySha256: createHash('sha256').update(Buffer.from(fixture().secret, 'hex')).digest('hex'),
    };
  }
}

/** Every resolution reads and verifies the actual tenant-scoped SQL row; there is no unsigned cache. */
export function createReferenceOfflineAgentResolver(): OfflineSyncAgentResolver {
  return {
    async resolve(scope, operation) {
      if (!['reserve-numbering', 'submit-sync-batch'].includes(operation)) refuse();
      validateScope(scope);
      const client = createStynxPgClient({
        connectionString: fixture().databaseUrl,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
      });
      try {
        await client.connect();
        await client.query('begin read only');
        await client.query(
          `select set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true),set_config('app.role','app',true)`,
          [scope.tenantId, scope.actorId],
        );
        const result = await client.query<{
          value: unknown;
          tenant_id: string;
          role: string;
          tenant: string;
          actor: string;
          readonly: string;
          application_role: string;
        }>(
          `select value, tenant_id::text, current_user::text as role,
          current_setting('app.tenant_id') as tenant,current_setting('app.actor_id') as actor,
          current_setting('transaction_read_only') as readonly,current_setting('app.role') as application_role
          from core.config where key=$1 and tenant_id=$2`,
          [key(scope), scope.tenantId],
        );
        const row = result.rows[0];
        if (
          result.rows.length !== 1 ||
          row!.role !== 'stynx_app' ||
          row!.application_role !== 'app' ||
          row!.tenant !== scope.tenantId ||
          row!.actor !== scope.actorId ||
          row!.tenant_id !== scope.tenantId ||
          row!.readonly !== 'on'
        )
          refuse();
        const verified = verify(row!.value, scope);
        await client.query('commit');
        return verified.agentId;
      } finally {
        await client.end();
      }
    },
  };
}
