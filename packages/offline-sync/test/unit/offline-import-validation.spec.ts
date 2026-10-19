import { describe, expect, it, vi } from 'vitest';
import { OfflineImportError } from '../../src/import-contract.js';
import { legacyArchivedFixture } from '../support/offline-archive-fixture.js';
import {
  parseOfflineImportManifest,
  validateOfflineImportManifest,
  importInstantMicroseconds,
  parseImportJson,
  validRangeCreationEvidence,
  type RangeCreationEvidence,
} from '../../src/import-validation.js';
import {
  importManifest,
  rehashManifest,
  fixtureDigest,
  fixtureBytesDigest,
  IMPORT_AT,
  IMPORT_TENANT,
  IMPORT_OTHER_TENANT,
} from '../support/offline-import-fixtures.js';

const refused = (run: () => unknown) => {
  expect(run).toThrow(OfflineImportError);
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ reason: 'invalid-manifest' });
  }
};
const object = (value: object) => value as unknown as Record<string, unknown>;

describe('D6 closed import parser and independent manifest identity', () => {
  it('accepts the eleven exact row kinds, preserves historical nullable facts, lexical instants and opaque fingerprints', () => {
    const manifest = importManifest();
    const parsed = parseOfflineImportManifest(JSON.stringify(manifest));
    expect(parsed).toEqual(manifest);
    expect(parsed.records.map((record) => record.kind)).toEqual([
      'ranges',
      'reservations',
      'queueItems',
      'conflicts',
      'batches',
      'transportKeys',
      'receipts',
      'attempts',
      'consumption',
      'conflictEvidence',
      'conflictActions',
    ]);
    expect(parsed.records[0]?.row.created_at).toBe(IMPORT_AT);
    expect(parsed.records.find((record) => record.kind === 'attempts')?.row.payload_hash).toBe(
      'MALFORMED original received hash',
    );
    expect(parsed.records.find((record) => record.kind === 'batches')?.row.context_hash).toBe(
      'original-historic-context-fingerprint',
    );
    expect(parsed.records.find((record) => record.kind === 'ranges')?.row.created_by).toBe(null);
    expect(parsed).not.toBe(manifest);
    object(parsed.source).system = 'detached';
    expect(manifest.source.system).toBe('consumer-system');
  });

  it('binds the entire root envelope while omitting only the root manifest digest', () => {
    const original = importManifest();
    for (const mutate of [
      (value: typeof original) => {
        value.source.sha256 = fixtureBytesDigest(Buffer.from('changed capture'));
      },
      (value: typeof original) => {
        value.records.reverse();
      },
      (value: typeof original) => {
        value.mappings.reverse();
      },
      (value: typeof original) => {
        object(value.records[0]!.row).updated_at = IMPORT_AT;
      },
    ]) {
      const changed = structuredClone(original);
      mutate(changed);
      refused(() => validateOfflineImportManifest(changed));
      expect(validateOfflineImportManifest(rehashManifest(changed))).toEqual(
        rehashManifest(changed),
      );
    }
  });

  for (const [name, mutate] of [
    [
      'unknown root field',
      (value: Record<string, unknown>) => {
        value.allowWrite = true;
      },
    ],
    [
      'unknown source field',
      (value: Record<string, unknown>) => {
        object(value.source as object).verified = true;
      },
    ],
    [
      'unknown record field',
      (value: Record<string, unknown>) => {
        object((value.records as object[])[0]!).sql = 'select 1';
      },
    ],
    [
      'unknown row field',
      (value: Record<string, unknown>) => {
        object((value.records as { row: object }[])[0]!.row).arbitrary_column = 'payload-secret';
      },
    ],
    [
      'missing nullable fact',
      (value: Record<string, unknown>) => {
        delete object((value.records as { row: object }[])[0]!.row).created_by;
      },
    ],
    [
      'unknown row kind',
      (value: Record<string, unknown>) => {
        object((value.records as object[])[0]!).kind = 'numbering_reservation_scopes';
      },
    ],
    [
      'wrong format',
      (value: Record<string, unknown>) => {
        value.formatVersion = 'consumer-import/2';
      },
    ],
  ] as const) {
    it(`refuses ${name}`, () => {
      const value = object(importManifest());
      mutate(value);
      refused(() => validateOfflineImportManifest(rehashManifest(value)));
    });
  }

  for (const duplicate of [
    'root',
    'source',
    'nested-payload',
    'escaped-source',
    'escaped-payload',
  ]) {
    it(`rejects decoded duplicate JSON keys at ${duplicate} before canonical materialization`, () => {
      let raw = JSON.stringify(importManifest());
      if (duplicate === 'root')
        raw = raw.replace(
          '"formatVersion":',
          '"formatVersion":"stynx-offline-import/1","formatVersion":',
        );
      if (duplicate === 'source')
        raw = raw.replace(
          '"system":"consumer-system"',
          '"system":"consumer-system","system":"consumer-system"',
        );
      if (duplicate === 'escaped-source')
        raw = raw.replace(
          '"system":"consumer-system"',
          '"system":"consumer-system","\\u0073ystem":"consumer-system"',
        );
      if (duplicate === 'nested-payload')
        raw = raw.replace(
          '"payload_json":{"proof":true}',
          '"payload_json":{"proof":true,"proof":true}',
        );
      if (duplicate === 'escaped-payload')
        raw = raw.replace(
          '"payload_json":{"proof":true}',
          '"payload_json":{"proof":true,"pr\\u006fof":true}',
        );
      expect(() => parseOfflineImportManifest(raw)).toThrow(
        expect.objectContaining({ reason: 'invalid-manifest', object: 'duplicate-json-property' }),
      );
    });
  }

  it.each([
    '',
    '{} trailing',
    '[1,]',
    '{"x":1,}',
    '{"x" 1}',
    '{"x":01}',
    '{"x":NaN}',
    '{"x":Infinity}',
    '{"x":"\\q"}',
    '{"x":"unterminated}',
    'true false',
    '\u00a0{}',
  ])('rejects malformed raw JSON %j', (raw) => {
    refused(() => parseOfflineImportManifest(raw));
  });

  it('rejects getters, cycles and unsupported JSON without invoking coercion or accessor code', () => {
    const getter = vi.fn(() => ({})),
      toJSON = vi.fn(() => ({}));
    const accessor = importManifest();
    Object.defineProperty(accessor.source, 'system', { enumerable: true, get: getter });
    refused(() => validateOfflineImportManifest(accessor));
    expect(getter).not.toHaveBeenCalled();
    const coercion = importManifest();
    object(coercion).toJSON = toJSON;
    refused(() => validateOfflineImportManifest(coercion));
    expect(toJSON).not.toHaveBeenCalled();
    for (const invalid of [
      undefined,
      () => undefined,
      Symbol('private'),
      NaN,
      Infinity,
      1n,
      new Date(),
      new Map(),
    ]) {
      const value = importManifest();
      object(value.records[2]!.row).payload_json = { invalid };
      refused(() => validateOfflineImportManifest(value));
    }
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const value = importManifest();
    object(value.records[2]!.row).payload_json = cycle;
    refused(() => validateOfflineImportManifest(value));
  });

  it('refuses sparse and extended arrays, nonenumerable fields, NUL and malformed Unicode', () => {
    const sparse = [];
    sparse.length = 1;
    const extended: unknown[] = [];
    Object.defineProperty(extended, '4294967295', { value: 'hidden', enumerable: true });
    for (const invalid of [sparse, extended, '\ud800', 'bad\0value']) {
      const value = importManifest();
      object(value.records[2]!.row).payload_json = { invalid };
      refused(() => validateOfflineImportManifest(value));
    }
    const value = importManifest();
    Object.defineProperty(value, 'hidden', { value: 'hidden', enumerable: false });
    refused(() => validateOfflineImportManifest(value));
  });

  it.each([
    '2023-02-29T00:00:00Z',
    '2020-02-30T00:00:00Z',
    '2020-02-29T24:00:00Z',
    '2020-02-29T00:00:60Z',
    '2020-02-29T00:00:00.1234567Z',
    '2020-02-29T00:00:00',
    '0000-01-01T00:00:00Z',
    '2020-02-29T00:00:00+16:00',
  ])('refuses an unrepresentable instant %s', (instant) => {
    const value = importManifest();
    object(value.records[0]!.row).created_at = instant;
    refused(() => validateOfflineImportManifest(rehashManifest(value)));
  });

  it('keeps six microsecond digits and equivalent explicit zones without Date rounding', () => {
    expect(importInstantMicroseconds('2020-02-29T06:34:56.123456+03:30')).toBe(1582945496123456n);
    expect(importInstantMicroseconds('2020-02-29T03:04:56.123456Z')).toBe(1582945496123456n);
    const manifest = importManifest();
    expect(validateOfflineImportManifest(manifest).records[0]!.row.created_at).toBe(IMPORT_AT);
  });

  it.each([
    '01',
    '+1',
    '-0',
    '1.0',
    '1e0',
    '9223372036854775808',
    '-9223372036854775809',
    '9007199254740992',
  ])('refuses a noncanonical or unsafe runtime bigint %s', (number) => {
    const value = importManifest();
    object(value.records[0]!.row).next_number = number;
    refused(() => validateOfflineImportManifest(rehashManifest(value)));
  });

  it('requires UTF-8 byte bounds for source and mapping identity', () => {
    for (const mutate of [
      (value: ReturnType<typeof importManifest>) => {
        value.source.system = 'é'.repeat(128);
      },
      (value: ReturnType<typeof importManifest>) => {
        value.source.snapshotId = 'é'.repeat(2049);
      },
      (value: ReturnType<typeof importManifest>) => {
        value.mappings[0]!.sourceKey = 'é'.repeat(2049);
      },
    ]) {
      const value = importManifest();
      mutate(value);
      refused(() => validateOfflineImportManifest(rehashManifest(value)));
    }
    const value = importManifest();
    value.source.system = 'é'.repeat(127) + 'a';
    value.source.snapshotId = 'é'.repeat(2048);
    expect(validateOfflineImportManifest(rehashManifest(value)).source).toEqual(value.source);
  });

  it('requires one unambiguous tenant-preserving mapping per record', () => {
    const original = importManifest();
    for (const mutate of [
      (value: typeof original) => {
        value.mappings.pop();
      },
      (value: typeof original) => {
        value.records.push(structuredClone(value.records[0]!));
      },
      (value: typeof original) => {
        value.mappings.push(structuredClone(value.mappings[0]!));
      },
      (value: typeof original) => {
        value.mappings[0]!.tenantId = IMPORT_OTHER_TENANT;
      },
      (value: typeof original) => {
        object(value.mappings[0]!.targetKey).id = '44444444-4444-4444-8444-444444444444';
      },
      (value: typeof original) => {
        object(value.mappings[2]!.targetKey).tenant_id = IMPORT_OTHER_TENANT;
      },
      (value: typeof original) => {
        object(value.mappings[0]!.targetKey).sql = 'id';
      },
    ]) {
      const value = structuredClone(original);
      mutate(value);
      refused(() => validateOfflineImportManifest(rehashManifest(value)));
    }
  });

  it('validates archive bytes and canonical header/mapping digests without requiring invented independent proof', () => {
    const value = importManifest();
    const batch = value.records.find((record) => record.kind === 'batches')!;
    const body = Buffer.from('{ "original" : true }\n');
    batch.row.response_status = 201;
    batch.row.response_body_base64 = body.toString('base64');
    batch.row.response_headers = { 'content-type': 'application/json' };
    const archive = {
      batch: { tenant_id: IMPORT_TENANT, device_id: 'device', device_batch_id: 'batch' },
      sourceSha256: value.source.sha256,
      mappingSha256: fixtureDigest(value.mappings),
      responseStatus: 201,
      responseBodyBase64: body.toString('base64'),
      responseBodySha256: fixtureBytesDigest(body),
      responseHeaders: batch.row.response_headers,
      responseHeadersSha256: fixtureDigest(batch.row.response_headers),
      verificationEvidence: { sourceProof: 'external-real-proof-id' },
    };
    value.archives = [archive];
    expect(validateOfflineImportManifest(rehashManifest(value)).archives[0]).toEqual(archive);
    for (const mutate of [
      (changed: typeof archive) => {
        changed.responseBodyBase64 = 'YR==';
      },
      (changed: typeof archive) => {
        changed.responseBodySha256 = fixtureBytesDigest(Buffer.from('other'));
      },
      (changed: typeof archive) => {
        changed.responseHeadersSha256 = fixtureDigest({ other: 'header' });
      },
      (changed: typeof archive) => {
        changed.mappingSha256 = fixtureDigest([]);
      },
      (changed: typeof archive) => {
        changed.sourceSha256 = fixtureBytesDigest(Buffer.from('other capture'));
      },
      (changed: typeof archive) => {
        changed.responseStatus = 200;
      },
    ]) {
      const changed = structuredClone(value);
      mutate(changed.archives[0]! as typeof archive);
      refused(() => validateOfflineImportManifest(rehashManifest(changed)));
    }
    const duplicated = structuredClone(value);
    duplicated.archives.push(structuredClone(archive));
    refused(() => validateOfflineImportManifest(rehashManifest(duplicated)));
  });
});

it.each([true, false])('refuses a source-authored internal archive marker=%s', (marker) => {
  const value = importManifest();
  object(value.records.find((record) => record.kind === 'batches')!.row).response_body_is_archived =
    marker;
  refused(() => validateOfflineImportManifest(rehashManifest(value)));
});

it('preserves permitted empty historical optional text without inventing provenance', () => {
  const value = importManifest();
  object(value.records.find((record) => record.kind === 'reservations')!.row).cancellation_reason =
    '';
  object(value.records.find((record) => record.kind === 'conflictActions')!.row).reason = '';
  expect(validateOfflineImportManifest(rehashManifest(value)).records).toEqual(value.records);
});

it('enforces per-kind UTF-8 storage bounds before any live import', () => {
  for (const [kind, column, maximum] of [
    ['queueItems', 'device_batch_id', 255],
    ['conflictActions', 'reason', 4000],
    ['reservations', 'cancellation_reason', 500],
  ] as const) {
    const value = importManifest();
    object(value.records.find((record) => record.kind === kind)!.row)[column] = 'é'.repeat(
      Math.floor(maximum / 2) + 1,
    );
    refused(() => validateOfflineImportManifest(rehashManifest(value)));
  }
});

it('preserves legal prototype-named JSON keys without changing object prototypes', () => {
  const value = importManifest();
  const payload = JSON.parse(
    '{"__proto__":{"polluted":"original-fact"},"constructor":"source-value"}',
  ) as Record<string, unknown>;
  object(value.records.find((record) => record.kind === 'queueItems')!.row).payload_json = payload;
  const parsed = parseOfflineImportManifest(JSON.stringify(rehashManifest(value)));
  const actual = parsed.records.find((record) => record.kind === 'queueItems')!.row.payload_json;
  expect(Object.hasOwn(actual, '__proto__')).toBe(true);
  expect(actual.__proto__).toEqual({ polluted: 'original-fact' });
  expect(actual.constructor).toBe('source-value');
  expect(Object.getPrototypeOf(actual)).toBe(Object.prototype);
  expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
});

it('binds UTF-16 key ordering independently of insertion order and accepts null-prototype JSON', () => {
  const left = importManifest(),
    right = importManifest();
  const first = Object.assign(Object.create(null) as Record<string, unknown>, {
    '\ue000': 'private-use',
    '\u{10000}': 'astral',
    a: -0,
  });
  const second = { a: 0, '\u{10000}': 'astral', '\ue000': 'private-use' };
  object(left.records.find((record) => record.kind === 'queueItems')!.row).payload_json = first;
  object(right.records.find((record) => record.kind === 'queueItems')!.row).payload_json = second;
  expect(rehashManifest(left).manifestSha256).toBe(rehashManifest(right).manifestSha256);
  expect(validateOfflineImportManifest(rehashManifest(left))).toEqual(
    validateOfflineImportManifest(rehashManifest(right)),
  );
});

it.each([1, 2] as const)(
  'preserves %s historical nullable declaration slots and actual legacy-derived keys',
  (count) => {
    const capture = legacyArchivedFixture(IMPORT_TENANT, count);
    const parsed = parseOfflineImportManifest(JSON.stringify(capture.manifest));
    expect(parsed.records.find((record) => record.kind === 'batches')!.row.declared_keys).toEqual(
      Array(count).fill(null),
    );
    expect(
      parsed.records
        .filter((record) => record.kind === 'queueItems')
        .map((record) => record.row.idempotency_key),
    ).toEqual(
      capture.manifest.records
        .filter((record) => record.kind === 'queueItems')
        .map((record) => record.row.idempotency_key),
    );
    expect(parsed.manifestSha256).toBe(capture.manifest.manifestSha256);
  },
);

it('continues rejecting duplicate nonnull declarations while retaining the legal null multiplicity', () => {
  const value = importManifest();
  value.records.find((record) => record.kind === 'batches')!.row.declared_keys = [
    null,
    'repeated-key',
    null,
    'repeated-key',
  ];
  refused(() => validateOfflineImportManifest(rehashManifest(value)));
});

it.each([
  ['ranges', 'id', 'not-a-uuid'],
  ['ranges', 'cancellation_reason', 'kept historical reason'],
  ['ranges', 'next_number', '102'],
  ['ranges', 'consumer_attributes', { large: 'é'.repeat(2050) }],
  ['ranges', 'creation_fingerprint', `sha256:${'a'.repeat(64)}`],
  ['ranges', 'creation_receipt', {}],
  ['reservations', 'next_number', '999'],
  ['reservations', 'shift_id', null],
  ['reservations', 'idempotency_fingerprint', 'old-key-fingerprint'],
  ['conflicts', 'status', 'resolved'],
  ['conflicts', 'resolved_at', IMPORT_AT],
  ['batches', 'lease_generation', '-1'],
  ['batches', 'batch_sequence', '0'],
  ['batches', 'lease_token', '11111111-1111-4111-8111-111111111111'],
  ['batches', 'response_body_base64', 'YQ='],
] as const)('validates static %s.%s row semantics before live SQL', (kind, column, changed) => {
  const manifest = importManifest();
  const record = manifest.records.find((record) => record.kind === kind)!;
  if (kind === 'reservations' && column === 'shift_id')
    object(record.row).reservation_origin = 'e6';
  object(record.row)[column] = changed;
  if (kind === 'ranges' && column === 'cancellation_reason') {
    expect(
      validateOfflineImportManifest(rehashManifest(manifest)).records.find(
        (record) => record.kind === kind,
      )!.row,
    ).toMatchObject({ cancellation_reason: changed });
  } else refused(() => validateOfflineImportManifest(rehashManifest(manifest)));
});
it('rejects NUL JSON property names and uppercase noncanonical UUIDs', () => {
  const manifest = importManifest();
  object(manifest.records[0]!.row).tenant_id = IMPORT_TENANT.toUpperCase().replace(
    '11111111',
    'AAAAAAAA',
  );
  refused(() => validateOfflineImportManifest(rehashManifest(manifest)));
  const nested = importManifest();
  object(nested.records.find((r) => r.kind === 'queueItems')!.row).payload_json = {
    'bad\0key': true,
  };
  refused(() => validateOfflineImportManifest(rehashManifest(nested)));
});
it('requires real string input for raw JSON and lossless instant parsing', () => {
  refused(() => parseImportJson(42 as never));
  refused(() => importInstantMicroseconds('not-an-instant'));
  expect(importInstantMicroseconds('2020-02-29T00:00:00-03:30')).toBe(1582947000000000n);
});
it('checks administered range evidence, optional attributes and immutable exact microseconds independently', () => {
  const record = importManifest().records.find((r) => r.kind === 'ranges')!;
  const legacy = record.row as RangeCreationEvidence;
  const request = {
    tenantId: legacy.tenant_id,
    orgUnitId: legacy.org_unit_id,
    entityType: legacy.entity_type,
    series: legacy.series,
    startNumber: Number(legacy.start_number),
    endNumber: Number(legacy.end_number),
    consumerAttributes: {},
  };
  const receipt = {
    id: legacy.id,
    ...request,
    nextNumber: request.startNumber,
    status: 'active',
    createdAt: IMPORT_AT,
    createdBy: 'original-actor',
  };
  const captured = {
    ...legacy,
    consumer_attributes: {},
    created_by: 'original-actor',
    creation_key: 'creation-key',
    creation_fingerprint: fixtureDigest(request),
    creation_receipt: receipt,
  };
  expect(validRangeCreationEvidence(captured, 1582945496123456n)).toBe(true);
  for (const difference of [
    { ...captured, created_by: null },
    { ...captured, creation_receipt: null },
    { ...captured, creation_receipt: [] },
    { ...captured, creation_receipt: { ...receipt, createdAt: 'invalid' } },
    { ...captured, creation_receipt: { ...receipt, nextNumber: request.startNumber + 1 } },
    { ...captured, consumer_attributes: null },
  ])
    expect(validRangeCreationEvidence(difference as RangeCreationEvidence, 1582945496123456n)).toBe(
      false,
    );
});

it('preserves the legal exhausted end+1 range counter', () => {
  const manifest = importManifest();
  object(manifest.records[0]!.row).next_number = '101';
  expect(validateOfflineImportManifest(rehashManifest(manifest)).records[0]!.row).toMatchObject({
    end_number: '100',
    next_number: '101',
  });
});

it('rejects canonical-pattern base64 with nonzero discarded padding bits', () => {
  const manifest = importManifest();
  object(manifest.records.find((record) => record.kind === 'batches')!.row).response_body_base64 =
    'YR==';
  expect(() => validateOfflineImportManifest(rehashManifest(manifest))).toThrow(
    expect.objectContaining({ reason: 'invalid-manifest' }),
  );
});
it('rejects a resolved conflict with a resolution but no resolving instant', () => {
  const manifest = importManifest();
  Object.assign(manifest.records.find((record) => record.kind === 'conflicts')!.row, {
    status: 'resolved',
    resolution: 'manual_review',
    resolved_at: null,
  });
  expect(() => validateOfflineImportManifest(rehashManifest(manifest))).toThrow(
    expect.objectContaining({ reason: 'invalid-manifest' }),
  );
});
