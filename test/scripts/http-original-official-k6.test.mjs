import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acquireHttpOriginalOfficialK6,
  inspectHttpOriginalOfficialK6Archive,
  observeHttpOriginalOfficialK6,
} from '../../scripts/lib/http-original-official-k6.mjs';

// INV-PERF-001: supplied archive shapes cannot grant live-origin or native-image standing.
for (const [label, input] of [
  ['empty', Buffer.alloc(0)],
  ['short', Buffer.alloc(24271693)],
  ['oversize', Buffer.alloc(24271695)],
  ['exact length wrong full digest', Buffer.alloc(24271694)],
  ['typed array', new Uint8Array(24271694)],
  ['shared buffer', Buffer.from(new SharedArrayBuffer(24271694))],
  [
    'proxy',
    new Proxy(Buffer.alloc(1), {
      get() {
        throw new Error('must not invoke proxy');
      },
    }),
  ],
])
  test(`fixed official archive refuses ${label} before decoding or execution`, () => {
    assert.throws(() => inspectHttpOriginalOfficialK6Archive(input), {
      code: 'HTTP_ORIGINAL_OFFICIAL_K6_INVALID',
    });
  });
test('official source-fixed acquisition refuses caller transport, pins, paths and cached evidence before network', async () => {
  for (const input of [
    undefined,
    {
      fetchImpl() {
        throw new Error('must not execute');
      },
    },
    { path: '/tmp/cache', sha256: '0'.repeat(64) },
  ]) {
    await assert.rejects(acquireHttpOriginalOfficialK6(input), {
      code: 'HTTP_ORIGINAL_OFFICIAL_K6_INVALID',
    });
  }
  assert.throws(() => inspectHttpOriginalOfficialK6Archive(Buffer.alloc(24271694), true), {
    code: 'HTTP_ORIGINAL_OFFICIAL_K6_INVALID',
  });
});
test('official observation cannot adopt caller acquisition/native-image receipts', () => {
  for (const value of [{}, { nativeExecuted: true }, Object.create(null), null])
    assert.throws(() => observeHttpOriginalOfficialK6(value), {
      code: 'HTTP_ORIGINAL_OFFICIAL_K6_INVALID',
    });
  assert.throws(() => observeHttpOriginalOfficialK6({}, true), {
    code: 'HTTP_ORIGINAL_OFFICIAL_K6_INVALID',
  });
});
