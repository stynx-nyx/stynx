import { createStynxFixtures } from '../src/fixtures';

describe('createStynxFixtures unit defaults', () => {
  function makeClient() {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
      end: vi.fn(async () => undefined),
    };
    return client;
  }

  it('generates tenant and user defaults when optional fields are omitted', async () => {
    const client = makeClient();
    const fixtures = createStynxFixtures(vi.fn(async () => client as never));

    const tenant = await fixtures.createTenant();
    const user = await fixtures.createUser();
    const localizedUser = await fixtures.createUser({
      id: 'user-2',
      email: 'user-2@example.com',
      externalSubject: 'external-2',
      locale: 'en-US',
    });

    expect(tenant).toEqual({
      id: expect.any(String),
      slug: expect.stringMatching(/^tenant-/),
      name: 'Testing Tenant',
    });
    expect(user).toEqual({
      id: expect.any(String),
      email: expect.stringMatching(/@example\.com$/),
    });
    expect(localizedUser).toEqual({
      id: 'user-2',
      email: 'user-2@example.com',
      externalSubject: 'external-2',
      locale: 'en-US',
    });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into tenancy.tenants'),
      [tenant.id, tenant.slug, tenant.name, expect.any(String)],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into auth.users'),
      [user.id, user.email, user.id, 'pt-BR', expect.any(String)],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into auth.users'),
      ['user-2', 'user-2@example.com', 'external-2', 'en-US', expect.any(String)],
    );
    expect(client.end).toHaveBeenCalledTimes(3);
  });

  it('generates document defaults and preserves explicit optional fields', async () => {
    const client = makeClient();
    const fixtures = createStynxFixtures(vi.fn(async () => client as never));

    const generated = await fixtures.createDocument({
      tenantId: 'tenant-1',
      ownerUserId: 'user-1',
    });
    const explicit = await fixtures.createDocument({
      id: 'doc-2',
      tenantId: 'tenant-1',
      ownerUserId: 'user-1',
      collection: 'contracts',
      filename: 'contract.txt',
      mimeType: 'text/plain',
      s3Key: 'testing/contract.txt',
      checksumSha256: 'a'.repeat(64),
      byteSize: 64,
    });

    expect(generated).toEqual({
      id: expect.any(String),
      tenantId: 'tenant-1',
      ownerUserId: 'user-1',
      collection: 'invoices',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      s3Key: expect.stringMatching(/^testing\/.+\.pdf$/),
      checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      byteSize: 128,
    });
    expect(explicit).toEqual({
      id: 'doc-2',
      tenantId: 'tenant-1',
      ownerUserId: 'user-1',
      collection: 'contracts',
      filename: 'contract.txt',
      mimeType: 'text/plain',
      s3Key: 'testing/contract.txt',
      checksumSha256: 'a'.repeat(64),
      byteSize: 64,
    });
  });
});
