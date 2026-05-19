import {
  createUuidV7,
  headerToString,
  isOptionalTenancyPath,
  isUuidV7,
  normalizedPath,
  parseBearerTenantClaims,
  resolveSubdomainTenantId,
} from '../../src/utils';

function bearer(payload: Record<string, unknown>): string {
  return `Bearer header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
}

describe('tenancy utils', () => {
  it('normalizes headers, paths, optional tenancy routes, and UUIDv7 values', () => {
    const id = createUuidV7(new Date('2026-05-18T12:00:00.000Z').getTime());
    expect(isUuidV7(id)).toBe(true);
    expect(isUuidV7('not-a-uuid')).toBe(false);
    expect(headerToString(['tenant-a', 'tenant-b'])).toBe('tenant-a');
    expect(headerToString([1])).toBeUndefined();
    expect(normalizedPath({ originalUrl: '/records?x=1' })).toBe('/records');
    expect(normalizedPath({ url: '' })).toBe('/');
    expect(normalizedPath({})).toBe('/');
    expect(isOptionalTenancyPath('/_probes/data-tx')).toBe(true);
    expect(isOptionalTenancyPath('/records')).toBe(false);
  });

  it('parses bearer tenant claims defensively', () => {
    expect(parseBearerTenantClaims(undefined)).toBeNull();
    expect(parseBearerTenantClaims('Basic abc')).toBeNull();
    expect(parseBearerTenantClaims('Bearer one-part')).toBeNull();
    expect(parseBearerTenantClaims('Bearer header.invalid-json.sig')).toBeNull();
    expect(parseBearerTenantClaims(bearer({ sub: 'user-1', tenant_id: 'tenant-1' }))).toEqual({
      sub: 'user-1',
      tenantId: 'tenant-1',
    });
    expect(parseBearerTenantClaims(bearer({ sub: 1, tenant_id: false }))).toEqual({});
  });

  it('treats malformed bearer tokens with missing payload parts as invalid', () => {
    const originalSplit = String.prototype.split;
    const split = vi.spyOn(String.prototype, 'split').mockImplementation(function splitMock(this: string, separator, limit) {
      if (this.valueOf() === 'header.sig') {
        const parts = ['header'] as string[];
        parts.length = 2;
        return parts;
      }
      return Reflect.apply(originalSplit, this, [separator, limit]) as string[];
    });

    expect(parseBearerTenantClaims('Bearer header.sig')).toBeNull();
    split.mockRestore();
  });

  it('resolves subdomain tenants with default UUIDv7 and custom patterns', () => {
    const uuidTenant = createUuidV7();
    expect(resolveSubdomainTenantId(`${uuidTenant}.example.test:443`)).toBe(uuidTenant);
    expect(resolveSubdomainTenantId('tenant-a.example.test')).toBeUndefined();
    expect(resolveSubdomainTenantId(' tenant-a.example.test ', /^([^.]+)\.example\.test$/u)).toBe('tenant-a');
    expect(resolveSubdomainTenantId('app.example.test', /tenant-([^.]+)/u)).toBeUndefined();
    expect(resolveSubdomainTenantId('app.tenant-alpha.example.test', /tenant-([^.]+)/u)).toBe('alpha');
    expect(resolveSubdomainTenantId('app.example.test', /^app\.example\.test$/u)).toBe('app.example.test');
    expect(resolveSubdomainTenantId('', /^(.+)$/u)).toBeUndefined();
    expect(resolveSubdomainTenantId('.example.test', /^(.+)$/u)).toBeUndefined();
  });

  it('ignores custom matchers that produce no tenant candidate', () => {
    const matcher = {
      [Symbol.match]: () => {
        const match = [] as unknown as RegExpMatchArray;
        match.index = 0;
        match.input = 'app.example.test';
        return match;
      },
    } as unknown as RegExp;

    expect(resolveSubdomainTenantId('app.example.test', matcher)).toBeUndefined();
  });

  it('creates UUIDv7 values when entropy bytes are missing variant positions', async () => {
    vi.resetModules();
    vi.doMock('node:crypto', () => ({
      randomBytes: () => {
        const bytes = new Array(16).fill(1);
        bytes[6] = undefined;
        bytes[8] = undefined;
        return bytes;
      },
    }));

    const { createUuidV7: createWithSparseBytes, isUuidV7: isGeneratedUuidV7 } = await import('../../src/utils');

    expect(isGeneratedUuidV7(createWithSparseBytes(0))).toBe(true);
    vi.doUnmock('node:crypto');
  });
});
