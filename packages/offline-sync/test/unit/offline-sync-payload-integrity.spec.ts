import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalOfflineSyncPayload,
  canonicalOfflineSyncPayloadHash,
  verifyOfflineSyncPayloadHash,
} from '../../src/payload-integrity';
import type { CTG9SyncBatchItemInput, OfflineSyncItemContext } from '../../src/types';

const context: OfflineSyncItemContext = {
  tenantId: '00000000-0000-4000-8000-0000000000a1',
  actorId: 'authenticated-actor',
  agentId: 'business-agent',
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  batchId: 'batch-a',
  receiptId: 'receipt-a',
  now: '2026-10-10T12:00:00.000Z',
};
const item = (
  payloadJson: Record<string, unknown>,
  payloadHash = canonicalOfflineSyncPayloadHash(payloadJson),
): CTG9SyncBatchItemInput => ({
  queueItemId: 'queue-a',
  entityType: 'citation',
  localEntityId: 'local-a',
  idempotencyKey: 'receipt-a',
  payloadJson,
  payloadHash,
});
const sha = (text: string) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

describe('UPS-OFS-11 independent canonical payload integrity', () => {
  it('sorts nested object keys while preserving exact JSON values, escaping and array order', () => {
    const first = { z: [3, { y: 'ação 😀\n', a: null }, false], a: { b: -0, a: 1.25 } };
    const second = { a: { a: 1.25, b: 0 }, z: [3, { a: null, y: 'ação 😀\n' }, false] };
    const bytes = '{"a":{"a":1.25,"b":0},"z":[3,{"a":null,"y":"ação 😀\\n"},false]}';
    expect(canonicalOfflineSyncPayload(first)).toBe(bytes);
    expect(canonicalOfflineSyncPayload(second)).toBe(bytes);
    expect(canonicalOfflineSyncPayloadHash(first)).toBe(sha(bytes));
    expect(canonicalOfflineSyncPayloadHash(second)).toBe(sha(bytes));
    expect(
      canonicalOfflineSyncPayloadHash({ z: [false, { a: null, y: 'ação 😀\n' }, 3], a: first.a }),
    ).not.toBe(sha(bytes));
    expect(canonicalOfflineSyncPayloadHash({ ...first, a: { ...first.a, a: 1.2501 } })).not.toBe(
      sha(bytes),
    );
  });

  it('accepts null-prototype documents and repeated shared values without treating sharing as a cycle', () => {
    const shared = { value: 7 };
    const document = Object.assign(Object.create(null) as Record<string, unknown>, {
      b: shared,
      a: shared,
    });
    expect(canonicalOfflineSyncPayload(document)).toBe('{"a":{"value":7},"b":{"value":7}}');
  });

  const invalid: Array<[string, () => unknown]> = [
    ['undefined', () => ({ x: undefined })],
    ['bigint', () => ({ x: 1n })],
    ['function', () => ({ x: () => 1 })],
    ['symbol value', () => ({ x: Symbol('x') })],
    ['NaN', () => ({ x: NaN })],
    ['infinity', () => ({ x: Infinity })],
    ['Date', () => ({ x: new Date(0) })],
    ['Map', () => ({ x: new Map() })],
    [
      'class instance',
      () => ({
        x: new (class Value {
          x = 1;
        })(),
      }),
    ],
    [
      'cycle',
      () => {
        const value: Record<string, unknown> = {};
        value.x = value;
        return value;
      },
    ],
    ['sparse array', () => ({ x: new Array(2) })],
    ['array extra property', () => ({ x: Object.assign([1], { extra: 2 }) })],
    ['numeric non-index array property', () => ({ x: Object.assign([1], { '4294967295': 2 }) })],
    [
      'array accessor',
      () => ({ x: Object.defineProperty([1], '0', { get: () => 1, enumerable: true }) }),
    ],
    ['symbol property', () => ({ [Symbol('hidden')]: 1, x: 1 })],
    ['nonenumerable property', () => Object.defineProperty({}, 'x', { value: 1 })],
    ['unpaired surrogate value', () => ({ x: '\ud800' })],
    ['unpaired surrogate key', () => ({ ['\udfff']: 1 })],
    ['top-level null', () => null],
    ['top-level array', () => []],
    ['top-level scalar', () => 'text'],
  ];
  it.each(invalid)(
    'refuses ambiguous/non-JSON payload %s with the typed input error',
    (_name, factory) => {
      expect(() => canonicalOfflineSyncPayload(factory() as Record<string, unknown>)).toThrowError(
        expect.objectContaining({ code: 'OFFLINE_SYNC_INVALID_INPUT', status: 400 }),
      );
    },
  );

  it('refuses accessors without executing consumer code', () => {
    const getter = vi.fn(() => 'value');
    const payload = Object.defineProperty({}, 'secret', { enumerable: true, get: getter });
    expect(() => canonicalOfflineSyncPayload(payload)).toThrowError(
      expect.objectContaining({ code: 'OFFLINE_SYNC_INVALID_INPUT' }),
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it('computes independently of a syntactically valid submitted hash', async () => {
    const payload = { value: 7 };
    expect(await verifyOfflineSyncPayloadHash(item(payload), context)).toBe(true);
    expect(await verifyOfflineSyncPayloadHash(item(payload, sha('{"value":8}')), context)).toBe(
      false,
    );
    const port = { hash: vi.fn(async () => sha('consumer-v1:{"value":7}')) };
    expect(
      await verifyOfflineSyncPayloadHash(
        item(payload, sha('consumer-v1:{"value":7}')),
        context,
        port,
      ),
    ).toBe(true);
    expect(port.hash).toHaveBeenCalledWith(
      expect.objectContaining({ payloadJson: payload }),
      context,
    );
    expect(
      await verifyOfflineSyncPayloadHash(
        item(payload, sha('consumer-v1:{"value":8}')),
        context,
        port,
      ),
    ).toBe(false);
  });

  it.each(['', 'sha256:BAD', `sha256:${'a'.repeat(63)}`, `sha256:${'A'.repeat(64)}`])(
    'rejects malformed submitted digest %s without invoking the port',
    async (payloadHash) => {
      const port = { hash: vi.fn(async () => sha('{}')) };
      expect(await verifyOfflineSyncPayloadHash(item({}, payloadHash), context, port)).toBe(false);
      expect(port.hash).not.toHaveBeenCalled();
    },
  );

  it.each([null, undefined, 42, 'md5:bad', `sha256:${'A'.repeat(64)}`])(
    'fails closed on malformed custom-port result %s',
    async (result) => {
      await expect(
        verifyOfflineSyncPayloadHash(item({}), context, { hash: async () => result as string }),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    },
  );
});
