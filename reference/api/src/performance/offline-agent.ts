import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { types } from 'node:util';
import { Injectable } from '@nestjs/common';
import { createStynxPgClient, Database, executeTypedQuery } from '@stynx-nyx/data';
import type { OfflineSyncAgentResolver, TrustedOfflineSyncScope } from '@stynx-nyx/offline-sync';
import * as queries from './offline-agent.repository.js';

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
    (['fixtureId', 'secret', 'databaseUrl'] as const).some((key) => current[key] !== context?.[key])
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
  if (Object.entries(expected).some(([name, expectedValue]) => value[name] !== expectedValue))
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
            const role = await trx.run(queries.offlineAgentRoleQuery, []);
            if (role.role !== 'stynx_owner') refuse();
            await trx.run(queries.insertOfflineAgentBindingQuery, [key(scope), scope.tenantId, JSON.stringify(value)]);
            const stored = await trx.run(queries.offlineAgentStoredBindingQuery, [key(scope)]);
            if (!stored || stored.tenant_id !== scope.tenantId || verify(stored.value, scope).agentId !== agentId)
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
        await executeTypedQuery(client, queries.beginOfflineAgentReadQuery, []);
        await executeTypedQuery(client, queries.setOfflineAgentScopeQuery, [scope.tenantId, scope.actorId]);
        const row = await executeTypedQuery(client, queries.resolveOfflineAgentBindingQuery, [key(scope), scope.tenantId]);
        if (
          !row ||
          row.role !== 'stynx_app' ||
          row.application_role !== 'app' ||
          row.tenant !== scope.tenantId ||
          row.actor !== scope.actorId ||
          row.tenant_id !== scope.tenantId ||
          row.readonly !== 'on'
        )
          refuse();
        const verified = verify(row.value, scope);
        await executeTypedQuery(client, queries.commitOfflineAgentReadQuery, []);
        return verified.agentId;
      } finally {
        await client.end();
      }
    },
  };
}
