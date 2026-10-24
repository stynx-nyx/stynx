import { Client } from 'pg';
import { executeTypedQuery } from '@stynx-nyx/data';
import { auditTenantIdsQuery, verifyTenantChainQuery } from './audit.repository.js';

export interface AuditVerifyClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T = unknown>(sql: string, values?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface AuditVerifyClientFactoryOptions {
  connectionString: string;
}

export interface AuditVerifyOptions {
  tenantId?: string;
  limit?: number;
  clientFactory?: (options: AuditVerifyClientFactoryOptions) => AuditVerifyClient;
}

export interface AuditVerifyTenantResult {
  tenantId: string;
  valid: boolean;
  totalChecked: number;
  firstBrokenEventId?: string;
}

export interface AuditVerifyResult {
  valid: boolean;
  totalChecked: number;
  tenants: AuditVerifyTenantResult[];
}

function defaultClientFactory(options: AuditVerifyClientFactoryOptions) {
  return new Client({ connectionString: options.connectionString });
}

function sanitizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return 1000;
  }
  return Math.min(Math.trunc(limit), 10_000);
}

async function verifyTenant(
  client: Client | AuditVerifyClient,
  tenantId: string,
  limit: number,
): Promise<AuditVerifyTenantResult> {
  const rows = await executeTypedQuery(client, verifyTenantChainQuery, [tenantId, limit]);
  const firstBroken = rows.find((row) => !row.chain_valid);
  return {
    tenantId,
    valid: firstBroken === undefined,
    totalChecked: rows.length,
    ...(firstBroken ? { firstBrokenEventId: firstBroken.event_id } : {}),
  };
}

export async function verifyAuditChain(
  connectionString: string,
  options: AuditVerifyOptions = {},
): Promise<AuditVerifyResult> {
  const client = (options.clientFactory ?? defaultClientFactory)({ connectionString });
  await client.connect();
  try {
    const limit = sanitizeLimit(options.limit);
    const tenantIds = options.tenantId
      ? [options.tenantId]
      : (await executeTypedQuery(client, auditTenantIdsQuery, [])).map((row) => row.tenant_id);

    const tenants: AuditVerifyTenantResult[] = [];
    for (const tenantId of tenantIds) {
      tenants.push(await verifyTenant(client, tenantId, limit));
    }

    return {
      valid: tenants.every((tenant) => tenant.valid),
      totalChecked: tenants.reduce((total, tenant) => total + tenant.totalChecked, 0),
      tenants,
    };
  } finally {
    await client.end();
  }
}
