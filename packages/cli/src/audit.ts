import { Client } from 'pg';

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

interface TenantRow {
  tenant_id: string;
}

interface AuditVerifyRow {
  event_id: string;
  chain_valid: boolean;
}

function defaultClientFactory(options: AuditVerifyClientFactoryOptions): AuditVerifyClient {
  return new Client({ connectionString: options.connectionString }) as unknown as AuditVerifyClient;
}

function sanitizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return 1000;
  }
  return Math.min(Math.trunc(limit), 10_000);
}

async function verifyTenant(
  client: AuditVerifyClient,
  tenantId: string,
  limit: number,
): Promise<AuditVerifyTenantResult> {
  const result = await client.query<AuditVerifyRow>(
    `
      select
        event_id::text as event_id,
        chain_valid
      from audit.verify_chain($1::uuid, $2::int)
      order by occurred_at, event_id
    `,
    [tenantId, limit],
  );
  const firstBroken = result.rows.find((row) => !row.chain_valid);
  return {
    tenantId,
    valid: firstBroken === undefined,
    totalChecked: result.rows.length,
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
      : (await client.query<TenantRow>(
        `
          select distinct tenancy_id::text as tenant_id
          from audit.events
          where tenancy_id is not null
          order by tenancy_id::text
        `,
      )).rows.map((row) => row.tenant_id);

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
