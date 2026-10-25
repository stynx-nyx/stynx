import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyApiCoverage } from '../../packages/cli/engines/api-coverage.mjs';
const root = resolve(import.meta.dirname, '../..');
function run(name, source, { refuse = false, inspect } = {}) {
  test(name, () => {
    const dir = mkdtempSync(join(tmpdir(), 'stynx-i18n-schema-'));
    try {
      mkdirSync(join(dir, 'packages/fixture/src'), { recursive: true });
      writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
      writeFileSync(
        join(dir, 'packages/fixture/src/fixture.controller.ts'),
        `import { Controller, Get } from '@nestjs/common';\nimport { Public } from '@stynx-nyx/auth';\n${source}\n@Controller('/probe') class ControllerProbe { @Public() @Get() value(): Result { throw new Error(); } }`,
      );
      if (refuse) {
        assert.throws(
          () => verifyApiCoverage({ root: dir, writeOpenApi: true }),
          /Unsupported (?:object index signature schema|generic schema instantiation Dict)|invalid TypeScript controller source/u,
        );
      } else {
        const result = verifyApiCoverage({ root: dir, writeOpenApi: true });
        assert.equal(result.drift, false);
        const doc = JSON.parse(
          readFileSync(join(dir, 'docs/framework/contracts/openapi.json'), 'utf8'),
        );
        inspect?.(doc);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
run('sole string index', `type Result = {[key:string]:string};`, {
  inspect: (d) =>
    assert.deepEqual(d.components.schemas.Result.additionalProperties, { type: 'string' }),
});
run(
  'recursive JSON index',
  `type Value=string|number|boolean|null|Value[]|{[key:string]:Value};type Result=Record<string,Value>;`,
  {
    inspect: (d) => {
      assert.deepEqual(d.components.schemas.Result.additionalProperties, {
        $ref: '#/components/schemas/Value',
      });
      assert.ok(
        d.components.schemas.Value.anyOf.some(
          (x) =>
            x.type === 'object' && x.additionalProperties.$ref === '#/components/schemas/Value',
        ),
      );
    },
  },
);
run('unchanged typed Record', `type Result=Record<string,number>;`, {
  inspect: (d) =>
    assert.deepEqual(d.components.schemas.Result.additionalProperties, { type: 'number' }),
});
run('unchanged closed empty Record', `type Result=Record<string,never>;`, {
  inspect: (d) => assert.equal(d.components.schemas.Result.additionalProperties, false),
});
run('unchanged named object', `interface Result { value:string; }`, {
  inspect: (d) => assert.equal(d.components.schemas.Result.properties.value.type, 'string'),
});
for (const [name, type] of [
  ['number key', 'type Result={[key:number]:string}'],
  ['symbol key', 'type Result={[key:symbol]:string}'],
  ['template key', 'type Result={[key:`prefix-${string}`]:string}'],
  ['generic key', 'type Dict<T extends string>={[key:T]:string};type Result=Dict<string>'],
  ['mixed property', 'type Result={[key:string]:string;fixed:string}'],
  ['multiple signatures', 'type Result={[key:string]:string;[index:number]:string}'],
  ['readonly signature', 'type Result={readonly [key:string]:string}'],
  ['optional parameter', 'type Result={[key?:string]:string}'],
  ['rest parameter', 'type Result={[...key:string[]]:string}'],
  ['initialized parameter', "type Result={[key:string='x']:string}"],
  ['modified parameter', 'type Result={[public key:string]:string}'],
  ['multiple parameters', 'type Result={[key:string,other:string]:string}'],
  ['destructured parameter', 'type Result={[{key}:string]:string}'],
  ['missing value', 'type Result={[key:string]}'],
  ['never value', 'type Result={[key:string]:never}'],
  ['interface index', 'interface Result{[key:string]:string}'],
])
  run(name, type + ';', { refuse: true });

test('actual unchanged i18n controller propagates exactly two recursive override responses and preserves string-only input/security', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stynx-i18n-controller-schema-'));
  try {
    mkdirSync(join(dir, 'packages/i18n'), { recursive: true });
    cpSync(join(root, 'packages/i18n/src'), join(dir, 'packages/i18n/src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const result = verifyApiCoverage({ root: dir, writeOpenApi: true });
    assert.equal(result.drift, false);
    assert.equal(result.operations.length, 2);
    const doc = JSON.parse(
      readFileSync(join(dir, 'docs/framework/contracts/openapi.json'), 'utf8'),
    );
    assert.deepEqual(Object.keys(doc.paths), ['/_tenancy/i18n/overrides']);
    const route = doc.paths['/_tenancy/i18n/overrides'];
    assert.deepEqual(Object.keys(route).sort(), ['get', 'put']);
    for (const method of ['get', 'put']) {
      assert.deepEqual(route[method].responses['200'].content['application/json'].schema, {
        $ref: '#/components/schemas/I18nTenantOverrides',
      });
      assert.equal(
        route[method].responses['200'].content['application/json']['x-stynx-source-type'],
        'Promise<I18nTenantOverrides>',
      );
      assert.deepEqual(route[method].security, [{ bearerAuth: [], tenantHeader: [] }]);
      assert.deepEqual(Object.keys(route[method].responses), [
        '200',
        '400',
        '401',
        '403',
        '404',
        'default',
      ]);
      assert.equal(route[method]['x-stynx-controller'], 'I18nController');
    }
    assert.deepEqual(route.put.requestBody.content['application/json'].schema, {
      $ref: '#/components/schemas/TenantOverrideUpdateInput',
    });
    assert.deepEqual(doc.components.schemas.TenantOverrideUpdateInput.properties.catalog, {
      type: 'object',
      additionalProperties: { type: 'string' },
    });
    assert.deepEqual(doc.components.schemas.I18nTenantOverrides.additionalProperties, {
      $ref: '#/components/schemas/I18nOverrideValue',
    });
    assert.deepEqual(doc.components.schemas.I18nOverrideValue.anyOf, [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'null', const: null },
      { type: 'array', items: { $ref: '#/components/schemas/I18nOverrideValue' } },
      { type: 'object', additionalProperties: { $ref: '#/components/schemas/I18nOverrideValue' } },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
