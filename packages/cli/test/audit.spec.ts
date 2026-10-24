const mockPg = vi.hoisted(() => ({
  clients: [] as unknown[],
  // `pg.Client` is constructed with `new`; Vitest 4 rejects arrow-function
  // mock implementations as constructors, so the mock uses a `function` body.
  Client: vi.fn(function (options: { connectionString: string }) {
    const client = mockPg.clients.shift() as { connectionString?: string } | undefined;
    if (!client) {
      throw new Error('Missing mocked pg client');
    }
    client.connectionString = options.connectionString;
    return client;
  }),
}));

vi.mock('pg', () => ({ Client: mockPg.Client }));

import { QueryArgumentError, QueryRowValidationError } from '@stynx-nyx/data';
import { verifyAuditChain, type AuditVerifyClient } from '../src/audit.js';

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
      return { rows: [{ tenant_id: '11111111-1111-1111-1111-111111111111' }] as T[] };
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
        tenantId: '11111111-1111-1111-1111-111111111111',
        valid: false,
        totalChecked: 2,
        firstBrokenEventId: 'event-2',
      }],
    });

    expect(mockPg.Client).toHaveBeenCalledWith({ connectionString: 'postgresql://audit-default' });
    expect(fake.connectionString).toBe('postgresql://audit-default');
    expect(fake.connected).toBe(false);
  });

  it.each([
    ['tenant', { tenant_id: 17 }],
    ['tenant', {}],
    ['event', { event_id: 17, chain_valid: true }],
    ['event', { event_id: 'opaque-event', chain_valid: 'false' }],
    ['event', { event_id: 'opaque-event' }],
  ])('rejects malformed %s projections and closes the client', async (kind, row) => {
    const fake = new FakeAuditClient();
    const original = fake.query.bind(fake);
    vi.spyOn(fake, 'query').mockImplementation(async (sql) => {
      if (sql.includes(kind === 'tenant' ? 'select distinct tenancy_id' : 'audit.verify_chain')) {
        return { rows: [row] };
      }
      return original(sql);
    });
    await expect(verifyAuditChain('postgresql://audit-fixture', {
      clientFactory: () => fake,
    })).rejects.toBeInstanceOf(QueryRowValidationError);
    expect(fake.connected).toBe(false);
  });

  it('retains opaque event IDs, the first broken event and bound tenant/limit arguments', async () => {
    const fake = new FakeAuditClient();
    const query = vi.spyOn(fake, 'query');
    await expect(verifyAuditChain('postgresql://audit-fixture', {
      tenantId: '22222222-2222-2222-2222-222222222222', limit: 3.9, clientFactory: () => fake,
    })).resolves.toEqual({
      valid: false, totalChecked: 2,
      tenants: [{ tenantId: '22222222-2222-2222-2222-222222222222', valid: false, totalChecked: 2,
        firstBrokenEventId: 'event-2' }],
    });
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('audit.verify_chain'), ['22222222-2222-2222-2222-222222222222', 3]);
    expect(fake.connected).toBe(false);
  });


  it('rejects malformed tenant UUIDs before executing SQL without exposing the input', async () => {
    const fake = new FakeAuditClient();
    const query = vi.spyOn(fake, 'query');
    const invalid = 'private-tenant-not-a-uuid';
    const error = await verifyAuditChain('postgresql://audit-fixture', {
      tenantId: invalid, clientFactory: () => fake,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryArgumentError);
    expect(String(error)).not.toContain(invalid);
    expect(query).not.toHaveBeenCalled();
    expect(fake.connected).toBe(false);
  });


  it.each(['success', 'connect', 'query', 'end'])('preserves native client receiver and rejection identity: %s', async (phase) => {
    
    const failure = new Error('native client rejection');
    const calls: string[] = [];
    const client = {
      async connect() {
        expect(this).toBe(client); calls.push('connect');
        if (phase === 'connect') throw failure;
        return this;
      },
      async query(_sql: string, _values?: unknown[]) {
        expect(this).toBe(client); calls.push('query');
        if (phase === 'query') throw failure;
        return { rows: [] };
      },
      async end() {
        expect(this).toBe(client); calls.push('end');
        if (phase === 'end') throw failure;
      },
    };
    mockPg.clients.push(client);
    try {
      const result = verifyAuditChain('postgresql://native-port');
      if (phase === 'success') await expect(result).resolves.toBeDefined();
      else await expect(result).rejects.toBe(failure);
      expect(calls[0]).toBe('connect');
      if (phase === 'connect') expect(calls).toEqual(['connect']);
      else { expect(calls).toContain('query'); expect(calls.at(-1)).toBe('end'); }
    } finally {
      // The operation closes the fake client; its close order is asserted above.
    }
  });

});
