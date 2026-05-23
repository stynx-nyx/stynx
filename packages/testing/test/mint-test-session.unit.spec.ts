import { randomUUID } from 'node:crypto';
import { mintTestSession } from '../src/mint-test-session';

describe('mintTestSession', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('rejects use outside NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'development';

    await expect(
      mintTestSession({
        userId: randomUUID(),
        tenantId: randomUUID(),
      }),
    ).rejects.toThrow('mintTestSession is only available when NODE_ENV === "test"');
  });

  it('mints with an audience and omits permsHash when permissions are empty', async () => {
    process.env.NODE_ENV = 'test';

    const session = await mintTestSession({
      sid: 'sid-1',
      userId: randomUUID(),
      tenantId: randomUUID(),
      audience: 'stynx-tests',
      perms: [],
    });
    const [, payloadSegment] = session.token.split('.');
    const payload = JSON.parse(Buffer.from(payloadSegment ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;

    expect(payload.aud).toBe('stynx-tests');
    expect(payload.sid).toBe('sid-1');
    expect(payload.perms_hash).toBe(undefined);
  });

  it('uses default issuer, cognito fallback, and sorted permissions hash', async () => {
    process.env.NODE_ENV = 'test';
    const now = new Date('2026-05-22T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      const userId = randomUUID();
      const tenantId = randomUUID();
      const session = await mintTestSession({
        userId,
        tenantId,
        perms: ['storage:write', 'audit:read'],
      });
      const [, payloadSegment] = session.token.split('.');
      const payload = JSON.parse(Buffer.from(payloadSegment ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;

      expect(payload.iss).toBe('https://stynx.testing.local');
      expect(payload.sub).toBe(userId);
      expect(payload.tenant_id).toBe(tenantId);
      expect(payload.perms_hash).toBe('audit:read|storage:write');
    } finally {
      vi.useRealTimers();
    }
  });
});
