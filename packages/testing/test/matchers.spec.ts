// Unit tests for the matcher helpers' control-flow paths (success +
// wrong-error + no-error). Covers the lines previously missed by the
// integration-heavy testing.spec.ts.

import {
  ReadOnlyViolationError,
  RestoreConflictError,
  SoftDeleteBlockedError,
} from '@stynx/data';
import {
  expectROCannotWrite,
  expectRestoreConflict,
  expectSoftDeleteBlocked,
} from '../src/matchers';

describe('expectROCannotWrite', () => {
  it('resolves when fn throws ReadOnlyViolationError', async () => {
    await expect(
      expectROCannotWrite(async () => {
        throw new ReadOnlyViolationError('ro violation', { table: 'demo' });
      }),
    ).resolves.toBeUndefined();
  });

  it('rethrows non-RO errors', async () => {
    await expect(
      expectROCannotWrite(async () => {
        throw new Error('other');
      }),
    ).rejects.toThrow('other');
  });

  it('throws when fn resolves without error', async () => {
    await expect(
      expectROCannotWrite(async () => undefined),
    ).rejects.toThrow('Expected ReadOnlyViolationError to be thrown');
  });
});

describe('expectRestoreConflict', () => {
  it('resolves when fn throws RestoreConflictError', async () => {
    await expect(
      expectRestoreConflict(async () => {
        throw new RestoreConflictError('conflict', { table: 'demo' });
      }),
    ).resolves.toBeUndefined();
  });

  it('rethrows non-conflict errors', async () => {
    await expect(
      expectRestoreConflict(async () => {
        throw new TypeError('other');
      }),
    ).rejects.toThrow('other');
  });

  it('throws when fn resolves without error', async () => {
    await expect(expectRestoreConflict(async () => undefined)).rejects.toThrow(
      'Expected RestoreConflictError to be thrown',
    );
  });
});

describe('expectSoftDeleteBlocked', () => {
  it('resolves when fn throws SoftDeleteBlockedError', async () => {
    await expect(
      expectSoftDeleteBlocked(async () => {
        throw new SoftDeleteBlockedError('blocked', { table: 'demo' });
      }),
    ).resolves.toBeUndefined();
  });

  it('rethrows non-blocked errors', async () => {
    await expect(
      expectSoftDeleteBlocked(async () => {
        throw new RangeError('other');
      }),
    ).rejects.toThrow('other');
  });

  it('throws when fn resolves without error', async () => {
    await expect(expectSoftDeleteBlocked(async () => undefined)).rejects.toThrow(
      'Expected SoftDeleteBlockedError to be thrown',
    );
  });
});
