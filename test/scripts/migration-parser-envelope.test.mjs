import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

test('SQL parser adapter checks unknown result envelopes while retaining parser error semantics', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'stynx-parser-envelope-'));
  const key = `stynx.parser.fixture.${randomUUID()}`;
  const symbol = Symbol.for(key);
  const state = { result: undefined, calls: [] };
  globalThis[symbol] = state;
  try {
    const source = readFileSync(new URL('../../tools/migration-linter/src/parser.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: 'parser.ts',
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
    });
    assert.deepEqual((compiled.diagnostics ?? []).map((diagnostic) => diagnostic.code), []);
    writeFileSync(join(directory, 'parser.mjs'), compiled.outputText);
    const dependency = join(directory, 'node_modules/pg-query-emscripten');
    mkdirSync(dependency, { recursive: true });
    writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'pg-query-emscripten', type: 'module', exports: './index.js' }));
    // Substitute only the external parser boundary; execute the actual adapter.
    writeFileSync(join(dependency, 'index.js'), `export default class Parser { parse(sql) { const state = globalThis[Symbol.for(${JSON.stringify(key)})]; state.calls.push(sql); return state.result; } }`);
    const { validateSqlWithParser } = await import(pathToFileURL(join(directory, 'parser.mjs')).href);
    const valid = [{}, { error: null }, { error: undefined }, { error: {} }, { error: { message: null } }, { error: { message: undefined } }, { error: { message: '' }, opaque: { nested: [null, true] } }];
    for (const [index, result] of valid.entries()) {
      await context.test(`accepts the existing absent-error shape ${index}`, async () => {
        state.result = result; state.calls.length = 0;
        await validateSqlWithParser('select 1');
        assert.deepEqual(state.calls, ['select 1']);
      });
    }
    const invalid = [null, [], 'private-parser-result', 42, { error: 'private-error' }, { error: [] }, { error: { message: 42, payload: 'private-parser-payload' } }, { error: { message: ['private-parser-payload'] } }];
    for (const [index, result] of invalid.entries()) {
      await context.test(`rejects malformed declared parser fields ${index}`, async () => {
        state.result = result; state.calls.length = 0;
        await assert.rejects(validateSqlWithParser('select 1'), (error) => {
          assert.equal(error.message, 'Invalid SQL parser result');
          assert.equal(error.cause, undefined);
          return true;
        });
        assert.deepEqual(state.calls, ['select 1']);
      });
    }
    await context.test('preserves a legitimate parser syntax error message', async () => {
      state.result = { error: { message: 'syntax error at end of input' } };
      await assert.rejects(validateSqlWithParser('select'), { message: 'syntax error at end of input' });
    });
  } finally {
    delete globalThis[symbol];
    rmSync(directory, { recursive: true, force: true });
  }
});
