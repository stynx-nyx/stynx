import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const workspace = resolve(import.meta.dirname, '../..');

test('emitted data API describes partial pools and real markers while retaining table inference', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stynx-data-api-consumer-'));
  try {
    const configPath = join(workspace, 'packages/data/tsconfig.json');
    const raw = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(raw.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, dirname(configPath));
    assert.deepEqual(parsed.errors, []);
    const output = join(directory, 'emitted');
    const program = ts.createProgram([join(workspace, 'packages/data/src/index.ts')], {
      ...parsed.options,
      outDir: output,
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      noEmit: false,
      incremental: false,
    });
    const emission = program.emit(
      undefined,
      (file, contents) => {
        assert.ok(
          file.startsWith(`${output}/`),
          'declarations must remain inside the disposable consumer',
        );
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, contents);
      },
      undefined,
      true,
    );
    assert.equal(emission.emitSkipped, false);
    assert.deepEqual(
      emission.diagnostics.map((diagnostic) => diagnostic.code),
      [],
    );
    // The consumer resolves genuine pg/Drizzle dependencies from data's owner.
    symlinkSync(join(workspace, 'packages/data/node_modules'), join(directory, 'node_modules'));
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    const consumer = join(directory, 'consumer.ts');
    writeFileSync(
      consumer,
      `
import { pgSchema, text, uuid, type AnyPgTable } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import { StynxPoolRegistry, SOFT_DELETABLE, LIVE_ONLY, softDeletable, makeLiveOnly, isSoftDeletable, type Transaction, type SoftDeletableTable } from './emitted/data/src/index.js';
declare const registry: StynxPoolRegistry;
const maybePool: Pool | undefined = registry.get('app');
// @ts-expect-error An unchecked selection may be absent.
const certainPool: Pool = registry.get('app');
// @ts-expect-error The public map describes preinitialization and partial failures.
registry.pools.owner.connect();
if (maybePool) void maybePool.connect();
declare const injected: Pool;
registry.pools.app = injected;
void registry.pools.app.connect();
const schema = pgSchema('typed_markers');
const plain = schema.table('plain', { id: uuid('id').primaryKey(), name: text('name').notNull() });
const soft = softDeletable(plain);
const live = makeLiveOnly(schema.table('live', { id: uuid('id').primaryKey(), name: text('name').notNull() }));
const marker: true = soft[SOFT_DELETABLE];
const liveMarker: true = live[LIVE_ONLY];
// @ts-expect-error Marker properties are readonly.
soft[SOFT_DELETABLE] = true;
// @ts-expect-error Historical phantom string properties are not runtime fields.
soft.__stynxSoftDeletable;
// @ts-expect-error Historical live-only phantom properties are absent.
live.__stynxLiveOnly;
const row: typeof soft.$inferSelect = { id: 'id', name: 'typed' };
const generic = <T extends AnyPgTable>(table: T): SoftDeletableTable<T> => softDeletable(table);
const sameName: typeof plain.name = generic(plain).name;
declare const unknownValue: unknown;
if (isSoftDeletable(unknownValue)) {
  const proof: true = unknownValue[SOFT_DELETABLE];
  // @ts-expect-error A forgeable marker does not prove a PostgreSQL table.
  const forged: AnyPgTable = unknownValue;
  void proof; void forged;
}
if (isSoftDeletable(plain)) {
  const typed: SoftDeletableTable<typeof plain> = plain;
  const name: typeof plain.name = typed.name;
  void name;
}
declare const trx: Transaction;
void trx.softDelete(soft, 'id');
void trx.restoreFromArchive(soft, 'id');
void trx.select().from(soft).withDeleted();
void trx.select().from(soft).onlyDeleted();
void trx.hardDelete(live, 'id', { confirm: 'I understand this is irrecoverable' });
// @ts-expect-error Live-only tables cannot be soft-deleted.
void trx.softDelete(live, 'id');
// @ts-expect-error Live-only tables cannot be restored from archives.
void trx.restoreFromArchive(live, 'id');
// @ts-expect-error Live-only tables cannot include archives.
void trx.select().from(live).withDeleted();
// @ts-expect-error Live-only tables cannot select only archives.
void trx.select().from(live).onlyDeleted();
// @ts-expect-error The destructive confirmation remains a literal.
void trx.hardDelete(soft, 'id', { confirm: 'different' });
void certainPool; void marker; void liveMarker; void row; void sameName;
`,
    );
    const consumerProgram = ts.createProgram([consumer], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      exactOptionalPropertyTypes: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    });
    assert.deepEqual(
      ts.getPreEmitDiagnostics(consumerProgram).map((diagnostic) => ({
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      })),
      [],
    );
    assert.ok(readFileSync(join(output, 'data/src/index.d.ts'), 'utf8').includes('./types.js'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
