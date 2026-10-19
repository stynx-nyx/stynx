import { describe, expect, it, vi } from 'vitest';
import { InMemorySessionStore } from '../../src/in-memory-session-store.js';
import { SessionJwtSigningService } from '../../src/jwt-signing.service.js';
import { SessionService } from '../../src/session.service.js';
import { InvalidRefreshTokenError } from '../../src/errors.js';
import {
  resolveSessionsOptions,
  type SessionMirrorEntry,
  type SessionRecord,
} from '../../src/types.js';

// INV-RBAC-001; authorization-session-1.5.md, Active session admission in 1.6.0.
const at = new Date('2026-10-10T12:00:00Z');
const valid: SessionRecord = {
  sid: 'active-admission',
  userId: 'user-a',
  tenantId: 'tenant-a',
  cognitoSub: 'external|a',
  refreshFamilyId: 'family-a',
  refreshTokenHash: 'hash-a',
  status: 'active',
  createdAt: '2026-10-10T10:00:00Z',
  lastTouchedAt: '2026-10-10T11:00:00Z',
  updatedAt: '2026-10-10T11:30:00Z',
  idleExpiresAt: '2026-10-10T12:30:00Z',
  expiresAt: '2026-10-10T13:00:00Z',
};

async function fixture(record: SessionRecord | null = valid, clock = () => new Date(at)) {
  const store = new InMemorySessionStore();
  if (record) await store.createSession(record);
  const read = vi.spyOn(store, 'getSession');
  const revoke = vi.spyOn(store, 'revokeSession');
  const mirror: SessionMirrorEntry[] = [];
  const append = vi.fn(async (entry: SessionMirrorEntry) => {
    mirror.push(entry);
  });
  const options = resolveSessionsOptions({
    issuer: 'https://active-admission.test',
    redis: { url: 'redis://unused.test' },
    jwt: {},
    clock,
  });
  const service = new SessionService(options, store, new SessionJwtSigningService(options), {
    append,
  });
  return { service, store, read, revoke, append, mirror };
}

describe('SessionService active authentication admission', () => {
  it('admits the exact active record after one store read without revocation or mirror effects', async () => {
    const f = await fixture();
    await expect(f.service.getActive(valid.sid)).resolves.toEqual(valid);
    expect(f.read).toHaveBeenCalledExactlyOnceWith(valid.sid);
    expect(f.revoke).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
  });

  it('treats only literal null as missing after one read', async () => {
    const f = await fixture(null);
    await expect(f.service.getActive(valid.sid)).resolves.toBe(null);
    expect(f.read).toHaveBeenCalledExactlyOnceWith(valid.sid);
    expect(f.revoke).not.toHaveBeenCalled();
  });

  it.each(['revoked', 'reuse_detected'] as const)(
    'returns null for validated %s while preserving legacy get rejection',
    async (status) => {
      const f = await fixture({ ...valid, status, revokedAt: '2026-10-10T11:40:00Z' });
      await expect(f.service.getActive(valid.sid)).resolves.toBe(null);
      expect(f.read).toHaveBeenCalledExactlyOnceWith(valid.sid);
      expect(f.revoke).not.toHaveBeenCalled();
      expect(f.append).not.toHaveBeenCalled();
      await expect(f.service.get(valid.sid)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    },
  );

  it.each(['absolute', 'idle'] as const)(
    'revokes an active record at exact %s expiry and returns null only after successful cleanup',
    async (boundary) => {
      const record = {
        ...valid,
        ...(boundary === 'absolute'
          ? { expiresAt: at.toISOString(), idleExpiresAt: at.toISOString() }
          : { idleExpiresAt: at.toISOString() }),
      };
      const f = await fixture(record);
      await expect(f.service.getActive(valid.sid)).resolves.toBe(null);
      expect(f.read).toHaveBeenCalledExactlyOnceWith(valid.sid);
      expect(f.revoke).toHaveBeenCalledExactlyOnceWith(valid.sid, at.toISOString(), 'revoked');
      expect(f.mirror).toEqual([
        {
          sid: valid.sid,
          tenantId: valid.tenantId,
          userId: valid.userId,
          status: 'revoked',
          expiresAt: record.expiresAt,
          createdAt: at.toISOString(),
        },
      ]);
      await expect(f.store.getSession(valid.sid)).resolves.toBe(null);
    },
  );

  it('preserves inherited factor proof and accepts cleanup updatedAt after absolute expiry', async () => {
    const record = {
      ...valid,
      status: 'revoked' as const,
      updatedAt: '2026-10-10T14:00:00Z',
      revokedAt: '2026-10-10T14:00:00Z',
      strongFactorVerifiedAt: '2026-10-09T09:00:00Z',
      deviceMeta: { consumer: 'opaque' },
    };
    const f = await fixture(record);
    await expect(f.service.getActive(valid.sid)).resolves.toBe(null);
    expect(await f.store.getSession(valid.sid)).toEqual(record);
    expect(f.append).not.toHaveBeenCalled();
  });

  const malformed: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['array', []],
    ['primitive', 'active'],
    ['sid mismatch', { ...valid, sid: 'other' }],
    ...['userId', 'tenantId', 'cognitoSub', 'refreshFamilyId', 'refreshTokenHash'].flatMap(
      (key) =>
        [
          [key + ' empty', { ...valid, [key]: '' }],
          [key + ' absent', { ...valid, [key]: undefined }],
        ] as Array<[string, unknown]>,
    ),
    ['unknown status', { ...valid, status: 'disabled' }],
    ...[
      'createdAt',
      'updatedAt',
      'lastTouchedAt',
      'expiresAt',
      'idleExpiresAt',
      'revokedAt',
      'strongFactorVerifiedAt',
    ].flatMap(
      (key) =>
        [
          [key + ' invalid', { ...valid, [key]: 'not-an-instant' }],
          [key + ' non-string', { ...valid, [key]: new Date(at) }],
        ] as Array<[string, unknown]>,
    ),
    ['creation after touch', { ...valid, createdAt: '2026-10-10T11:15:00Z' }],
    ['touch after update', { ...valid, updatedAt: '2026-10-10T10:30:00Z' }],
    ['idle before creation', { ...valid, idleExpiresAt: '2026-10-10T09:00:00Z' }],
    ['idle after absolute expiry', { ...valid, idleExpiresAt: '2026-10-10T14:00:00Z' }],
    [
      'touch after absolute expiry',
      { ...valid, expiresAt: '2026-10-10T10:45:00Z', idleExpiresAt: '2026-10-10T10:30:00Z' },
    ],
    ['revocation before creation', { ...valid, revokedAt: '2026-10-10T09:00:00Z' }],
  ];
  it.each(malformed)(
    'refuses malformed %s without credential downgrade or cleanup',
    async (_label, record) => {
      const f = await fixture();
      f.read.mockResolvedValue(record as SessionRecord);
      await expect(f.service.getActive(valid.sid)).rejects.toThrow('SESSION_RECORD_INVALID');
      expect(f.read).toHaveBeenCalledExactlyOnceWith(valid.sid);
      expect(f.revoke).not.toHaveBeenCalled();
      expect(f.append).not.toHaveBeenCalled();
    },
  );

  it.each(['revoked', 'reuse_detected'] as const)(
    'validates malformed %s records before returning null',
    async (status) => {
      const f = await fixture({ ...valid, status, tenantId: '' });
      await expect(f.service.getActive(valid.sid)).rejects.toThrow('SESSION_RECORD_INVALID');
      expect(f.revoke).not.toHaveBeenCalled();
    },
  );

  it.each([new Date(Number.NaN), null, '2026-10-10T12:00:00Z'])(
    'rejects a non-finite-Date clock before nominal downgrade',
    async (clockValue) => {
      const f = await fixture({ ...valid, status: 'revoked' }, () => clockValue as Date);
      await expect(f.service.getActive(valid.sid)).rejects.toThrow('SESSION_CLOCK_INVALID');
      expect(f.read).toHaveBeenCalledExactlyOnceWith(valid.sid);
      expect(f.revoke).not.toHaveBeenCalled();
    },
  );

  it.each([new Error('storage down'), new InvalidRefreshTokenError()])(
    'propagates the original store exception without credential classification',
    async (failure) => {
      const f = await fixture();
      f.read.mockRejectedValue(failure);
      await expect(f.service.getActive(valid.sid)).rejects.toBe(failure);
      expect(f.read).toHaveBeenCalledExactlyOnceWith(valid.sid);
      expect(f.revoke).not.toHaveBeenCalled();
    },
  );

  it('propagates the original configured clock exception', async () => {
    const failure = new Error('clock down');
    const f = await fixture({ ...valid, status: 'revoked' }, () => {
      throw failure;
    });
    await expect(f.service.getActive(valid.sid)).rejects.toBe(failure);
    expect(f.revoke).not.toHaveBeenCalled();
  });

  it.each(['store', 'mirror'] as const)(
    'propagates the original %s cleanup exception',
    async (which) => {
      const failure = new InvalidRefreshTokenError();
      const f = await fixture({ ...valid, idleExpiresAt: at.toISOString() });
      if (which === 'store') f.revoke.mockRejectedValue(failure);
      else f.append.mockRejectedValue(failure);
      await expect(f.service.getActive(valid.sid)).rejects.toBe(failure);
      expect(f.read).toHaveBeenCalledExactlyOnceWith(valid.sid);
      expect(f.revoke).toHaveBeenCalledOnce();
      expect(f.append).toHaveBeenCalledTimes(which === 'mirror' ? 1 : 0);
    },
  );
});
