import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import {
  $AuditLogItem, $AuditLogPage, $AuditLogWireItem, $AuditLogWirePage, OfflineCtg9,
} from '../src/index';

const packageRoot = resolve(__dirname, '..');

describe('approved audit JSON wire compatibility', () => {
  it('retains the old root and OfflineCtg9 schema names as exact aliases', () => {
    expect($AuditLogItem).toBe($AuditLogWireItem);
    expect($AuditLogPage).toBe($AuditLogWirePage);
    expect(OfflineCtg9.$AuditLogItem).toBe(OfflineCtg9.$AuditLogWireItem);
    expect(OfflineCtg9.$AuditLogPage).toBe(OfflineCtg9.$AuditLogWirePage);
  });

  it('exposes only the observed string-or-null JSON timestamp domain in both compositions', () => {
    for (const schema of [$AuditLogItem, OfflineCtg9.$AuditLogItem]) {
      expect(schema.properties.occurredAt).toEqual({
        type: 'any-of', contains: [{ type: 'string' }, { type: 'null' }], isRequired: true,
      });
      expect(schema.properties.id).toEqual({ type: 'number', isRequired: true });
    }
  });

  it('resolves real published package exports and emitted aliases in a strict consumer', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'stynx-sdk-audit-consumer-'));
    try {
      const scope = join(fixture, 'node_modules', '@stynx-nyx');
      mkdirSync(scope, { recursive: true });
      symlinkSync(packageRoot, join(scope, 'sdk'), 'dir');
      const source = join(fixture, 'consumer.mts');
      writeFileSync(source, `
import type { AuditLogItem, AuditLogPage, AuditLogWireItem, AuditLogWirePage, OfflineCtg9 } from '@stynx-nyx/sdk';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type RootItem = Assert<Equal<AuditLogItem, AuditLogWireItem>>;
type RootPage = Assert<Equal<AuditLogPage, AuditLogWirePage>>;
type AlternateItem = Assert<Equal<OfflineCtg9.AuditLogItem, OfflineCtg9.AuditLogWireItem>>;
type AlternatePage = Assert<Equal<OfflineCtg9.AuditLogPage, OfflineCtg9.AuditLogWirePage>>;
type Timestamp = Assert<Equal<AuditLogItem['occurredAt'], string | null>>;
type AlternateTimestamp = Assert<Equal<OfflineCtg9.AuditLogItem['occurredAt'], string | null>>;
const text: AuditLogItem['occurredAt'] = '2026-10-24T00:00:00.000Z';
const missing: OfflineCtg9.AuditLogItem['occurredAt'] = null;
// @ts-expect-error raw Date is not the HTTP JSON representation
const date: AuditLogItem['occurredAt'] = new Date();
// @ts-expect-error raw numeric infinity serializes to null on the wire
const infinity: OfflineCtg9.AuditLogItem['occurredAt'] = Infinity;
void [text, missing, date, infinity];
`);
      const program = ts.createProgram([source], {
        strict: true, exactOptionalPropertyTypes: true, noEmit: true, skipLibCheck: false,
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [],
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
      const declaration = program.getSourceFiles().find((file) => file.fileName.endsWith('/dist/types/stynx-nyx-sdk.d.ts'));
      expect(declaration).toBeDefined();
      expect(program.getSourceFiles().some((file) => file.fileName.includes('/sdk/src/'))).toBe(false);
      const runtime = join(fixture, 'consumer.mjs');
      writeFileSync(runtime, `import * as sdk from '@stynx-nyx/sdk'; console.log(JSON.stringify([
        sdk.$AuditLogItem === sdk.$AuditLogWireItem,
        sdk.$AuditLogPage === sdk.$AuditLogWirePage,
        sdk.OfflineCtg9.$AuditLogItem === sdk.OfflineCtg9.$AuditLogWireItem,
        sdk.OfflineCtg9.$AuditLogPage === sdk.OfflineCtg9.$AuditLogWirePage,
        sdk.$AuditLogItem.properties.occurredAt,
        sdk.OfflineCtg9.$AuditLogItem.properties.occurredAt,
      ]));`);
      const observed: unknown = JSON.parse(execFileSync(process.execPath, [runtime], { cwd: fixture, encoding: 'utf8', timeout: 10000 }));
      expect(observed).toEqual([true, true, true, true, $AuditLogItem.properties.occurredAt, OfflineCtg9.$AuditLogItem.properties.occurredAt]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 30000);
});
