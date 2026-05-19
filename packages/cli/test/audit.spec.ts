const mockPg = vi.hoisted(() => ({
  clients: [] as unknown[],
  Client: vi.fn((options: { connectionString: string }) => {
    const client = mockPg.clients.shift() as { connectionString?: string } | undefined;
    if (!client) {
      throw new Error('Missing mocked pg client');
    }
    client.connectionString = options.connectionString;
    return client;
  }),
}));

vi.mock('pg', () => ({ Client: mockPg.Client }));

import { verifyAuditChain, type AuditVerifyClient } from '../src/audit';

class FakeAuditClient implements AuditVerifyClient {
  connected = false;
  connectionString?: string;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async end(): Promise<void> {
    this.connected = false;
  }

  async query<T = unknown>(sql: string): Promise<{ rows: T[]; rowCount?: number | null }> {
    if (sql.includes('select distinct tenancy_id')) {
      return { rows: [{ tenant_id: 'tenant-1' }] as T[] };
    }
    if (sql.includes('audit.verify_chain')) {
      return {
        rows: [
          { event_id: 'event-1', chain_valid: true },
          { event_id: 'event-2', chain_valid: false },
        ] as T[],
      };
    }
    return { rows: [] };
  }
}

describe('verifyAuditChain', () => {
  it('uses the default pg client factory when no override is supplied', async () => {
    const fake = new FakeAuditClient();
    mockPg.clients.push(fake);

    await expect(verifyAuditChain('postgresql://audit-default')).resolves.toEqual({
      valid: false,
      totalChecked: 2,
      tenants: [{
        tenantId: 'tenant-1',
        valid: false,
        totalChecked: 2,
        firstBrokenEventId: 'event-2',
      }],
    });

    expect(mockPg.Client).toHaveBeenCalledWith({ connectionString: 'postgresql://audit-default' });
    expect(fake.connectionString).toBe('postgresql://audit-default');
    expect(fake.connected).toBe(false);
  });
});
