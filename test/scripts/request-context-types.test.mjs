import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

test('emitted RequestContext declarations permit explicit patch clearing while keeping state strict', () => {
  const sourcePath = fileURLToPath(
    new URL('../../packages/core/src/request-context.ts', import.meta.url),
  );
  const configPath = fileURLToPath(new URL('../../packages/core/tsconfig.json', import.meta.url));
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  assert.deepEqual(
    parsed.errors.map((diagnostic) => diagnostic.code),
    [],
  );
  // Use normal declaration emission: isolated transpilation legitimately rejects
  // the inferred unique-symbol constants used by the actual implementation.
  const sourceProgram = ts.createProgram([sourcePath], {
    ...parsed.options,
    declaration: true,
    declarationMap: false,
    emitDeclarationOnly: true,
    noEmit: false,
    incremental: false,
  });
  let declaration = '';
  const emitted = sourceProgram.emit(
    sourceProgram.getSourceFile(sourcePath),
    (file, contents) => {
      if (file.endsWith('/request-context.d.ts')) declaration = contents;
    },
    undefined,
    true,
  );
  assert.equal(emitted.emitSkipped, false);
  assert.deepEqual(
    emitted.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    })),
    [],
  );
  assert.match(declaration, /export interface RequestContextPatch/u);
  const directory = mkdtempSync(join(tmpdir(), 'stynx-context-consumer-'));
  try {
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    writeFileSync(join(directory, 'request-context.d.ts'), declaration);
    const consumer = join(directory, 'consumer.ts');
    writeFileSync(
      consumer,
      `
import type { RequestContext, RequestContextMutator, RequestContextPatch, RequestContextState } from './request-context.js';
declare const mutator: RequestContextMutator;
declare const context: RequestContext;
const clear: RequestContextPatch = { tenantId: undefined, actorId: undefined, sessionId: undefined, locale: undefined, roles: undefined };
mutator.patch(clear);
mutator.patch({});
mutator.patch({ roles: [] });
const state: RequestContextState = { requestId: 'request', startedAt: new Date() };
const roles: readonly string[] | undefined = context.roles;
// @ts-expect-error State excludes explicit undefined optional values.
const invalidState: RequestContextState = { ...state, tenantId: undefined };
// @ts-expect-error Roles remain strings.
mutator.patch({ roles: [42] });
// @ts-expect-error Request identity cannot be patched.
mutator.patch({ requestId: 'changed' });
void roles; void invalidState;
`,
    );
    const program = ts.createProgram([consumer], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      exactOptionalPropertyTypes: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.deepEqual(
      diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      })),
      [],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
