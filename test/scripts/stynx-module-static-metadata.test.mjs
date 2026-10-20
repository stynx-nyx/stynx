// SM-20: consumed STYNX modules expose `imports` and `controllers` as static
// `@Module` metadata so a static reader (DEVAI v3 `inventory`) can resolve
// mounts without evaluating `forRoot()`. Runtime options stay in providers.
// The source half parses each module file; the runtime half reads the built
// classes' Nest metadata without calling `forRoot()`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import * as ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');

// Every module class the v3 template consumes from core, data, auth, backend,
// i18n, idempotency and flow. `staticImports` / `staticControllers` name the
// identifiers expected in the `@Module({...})` literal.
const modules = [
  {
    file: 'packages/core/src/core.module.ts',
    name: 'StynxCoreModule',
    staticImports: ['STYNX_CLS_MODULE'],
  },
  {
    file: 'packages/data/src/data.module.ts',
    name: 'StynxDataModule',
    staticImports: ['StynxCoreModule'],
  },
  {
    file: 'packages/auth/src/auth.module.ts',
    name: 'StynxAuthModule',
    staticImports: ['StynxCoreModule'],
    staticControllers: ['StynxAuthController'],
  },
  {
    file: 'packages/i18n/src/i18n.module.ts',
    name: 'StynxI18nModule',
    staticControllers: ['I18nController'],
  },
  { file: 'packages/idempotency/src/idempotency.module.ts', name: 'StynxIdempotencyModule' },
  {
    file: 'packages/flow/src/flow.module.ts',
    name: 'StynxFlowModule',
    staticControllers: ['FlowSignalController'],
  },
  { file: 'packages/backend/src/audit/audit.module.ts', name: 'StynxAuditModule' },
  { file: 'packages/backend/src/auth/auth.module.ts', name: 'StynxAuthModule' },
  {
    file: 'packages/backend/src/authorization/authorization.module.ts',
    name: 'StynxAuthorizationModule',
  },
  { file: 'packages/backend/src/db-context/db-context.module.ts', name: 'StynxDbContextModule' },
  {
    file: 'packages/backend/src/event-stream/event-stream.module.ts',
    name: 'StynxEventStreamModule',
  },
  {
    file: 'packages/backend/src/idempotency/idempotency.module.ts',
    name: 'StynxIdempotencyModule',
  },
  {
    file: 'packages/backend/src/identity-admin/identity-admin.module.ts',
    name: 'StynxIdentityAdminModule',
  },
  {
    file: 'packages/backend/src/pipeline/platform-pipeline.module.ts',
    name: 'StynxPlatformPipelineModule',
    // Which sub-modules mount is the option set itself (rateLimit/sla/idempotency
    // may each be `false`), so these imports are dynamic by design; none of them
    // mounts a controller.
    dynamicImportsByDesign: true,
  },
  { file: 'packages/backend/src/rate-limit/rate-limit.module.ts', name: 'StynxRateLimitModule' },
  { file: 'packages/backend/src/sla/sla.module.ts', name: 'StynxSlaModule' },
  { file: 'packages/backend/src/storage/storage.module.ts', name: 'StynxStorageModule' },
  {
    file: 'packages/backend/src/transactional-command/transactional-command.module.ts',
    name: 'StynxTransactionalCommandModule',
  },
  {
    file: 'packages/backend/src/webhook-signature/webhook-signature.module.ts',
    name: 'StynxWebhookSignatureModule',
  },
];

function parse(file) {
  return ts.createSourceFile(
    file,
    readFileSync(join(root, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function moduleClass(source, name) {
  const declaration = source.statements.find(
    (statement) => ts.isClassDeclaration(statement) && statement.name?.text === name,
  );
  assert.ok(declaration, `${source.fileName}: class ${name} not found`);
  const decorator = ts
    .getDecorators(declaration)
    ?.find(
      (item) =>
        ts.isCallExpression(item.expression) &&
        item.expression.expression.getText(source) === 'Module',
    );
  assert.ok(decorator, `${name}: no @Module decorator`);
  const [argument] = decorator.expression.arguments;
  assert.ok(
    argument && ts.isObjectLiteralExpression(argument),
    `${name}: @Module argument is not a literal`,
  );
  return { declaration, metadata: argument };
}

function property(literal, key) {
  return literal.properties.find(
    (item) => ts.isPropertyAssignment(item) && item.name.getText() === key,
  );
}

function arrayIdentifiers(source, assignment) {
  assert.ok(ts.isArrayLiteralExpression(assignment.initializer), 'expected an array literal');
  return assignment.initializer.elements.map((element) => {
    const callee = ts.isCallExpression(element) ? element.expression : element;
    const head = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
    return head.getText(source);
  });
}

// Object literals returned from static methods are the dynamic module halves.
function returnedModuleLiterals(declaration) {
  const literals = [];
  const visit = (node) => {
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isObjectLiteralExpression(node.expression)
    ) {
      if (property(node.expression, 'module')) literals.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  for (const member of declaration.members) {
    if (
      ts.isMethodDeclaration(member) &&
      member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)
    ) {
      visit(member);
    }
  }
  return literals;
}

for (const spec of modules) {
  test(`${spec.name} (${spec.file}) declares imports/controllers statically`, () => {
    const source = parse(spec.file);
    const { declaration, metadata } = moduleClass(source, spec.name);

    const controllers = property(metadata, 'controllers');
    if (spec.staticControllers) {
      assert.ok(controllers, `${spec.name}: @Module has no controllers`);
      const names = arrayIdentifiers(source, controllers);
      for (const expected of spec.staticControllers)
        assert.ok(names.includes(expected), `${spec.name}: ${expected}`);
    } else {
      assert.equal(controllers, undefined, `${spec.name}: unexpected static controllers`);
    }
    const imports = property(metadata, 'imports');
    if (spec.staticImports) {
      assert.ok(imports, `${spec.name}: @Module has no imports`);
      assert.deepEqual(arrayIdentifiers(source, imports), spec.staticImports);
    }

    for (const literal of returnedModuleLiterals(declaration)) {
      assert.equal(
        property(literal, 'controllers'),
        undefined,
        `${spec.name}: controllers mounted in forRoot()`,
      );
      const dynamicImports = property(literal, 'imports');
      if (dynamicImports && !spec.dynamicImportsByDesign) {
        // The only admitted dynamic imports are a caller's own forRootAsync imports.
        assert.equal(spec.name, 'StynxCoreModule', `${spec.name}: imports composed in forRoot()`);
      }
    }
    // A conditional spread of the caller's imports is the only dynamic import in core.
    if (spec.name === 'StynxCoreModule') {
      const spreads = returnedModuleLiterals(declaration).flatMap((literal) =>
        literal.properties.filter(ts.isSpreadAssignment).map((item) => item.getText(source)),
      );
      assert.deepEqual(spreads, ['...(imports.length > 0 ? { imports } : {})']);
    }
  });
}

async function built(packageDir, entry) {
  return import(pathToFileURL(join(root, packageDir, entry)).href);
}

test('built module classes carry the static metadata without calling forRoot()', async () => {
  const core = await built('packages/core', 'dist/core/src/index.js');
  const data = await built('packages/data', 'dist/data/src/index.js');
  const auth = await built('packages/auth', 'dist/auth/src/index.js');
  const i18n = await built('packages/i18n', 'dist/i18n/src/index.js');
  const flow = await built('packages/flow', 'dist/flow/src/index.js');
  const read = (key, target) => Reflect.getMetadata(key, target) ?? [];

  assert.deepEqual(read('controllers', i18n.StynxI18nModule), [i18n.I18nController]);
  assert.deepEqual(read('controllers', auth.StynxAuthModule), [auth.StynxAuthController]);
  assert.equal(read('imports', auth.StynxAuthModule).length, 1);
  assert.equal(read('imports', auth.StynxAuthModule)[0].module, core.StynxCoreModule);
  assert.equal(read('imports', data.StynxDataModule)[0].module, core.StynxCoreModule);
  assert.equal(read('imports', core.StynxCoreModule).length, 1);
  assert.equal(read('controllers', flow.StynxFlowModule).length, 19);
  assert.ok(read('controllers', flow.StynxFlowModule).every((item) => typeof item === 'function'));

  // Runtime options stay in providers: forRoot() adds no controllers or imports.
  const i18nRoot = i18n.StynxI18nModule.forRoot({ defaultLocale: 'pt-BR' });
  assert.equal(i18nRoot.controllers, undefined);
  assert.ok(
    i18nRoot.providers.some((provider) => provider.useValue?.defaultLocale === 'pt-BR'),
    'i18n options travel as a provider',
  );
  assert.equal(
    core.StynxCoreModule.forRoot({ appName: 'static-read', schema: undefined }).imports,
    undefined,
  );
});
