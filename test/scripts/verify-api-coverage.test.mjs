import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');

function discover(source, { refuse = false, inspectContract, refusal } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx-api-discovery-'));
  try {
    mkdirSync(join(fixture, 'packages', 'fixture', 'src'), { recursive: true });
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ type: 'module' }));
    writeFileSync(
      join(fixture, 'packages', 'fixture', 'src', 'fixture.controller.ts'),
      `import { Controller, Get, Post } from '@nestjs/common';\nimport { Public, PublicTenantRoute, Permission } from '@stynx-nyx/auth';\n${source}`,
    );
    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts', 'verify-api-coverage.mjs'), '--write-openapi', '--json'],
      {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    if (refuse) {
      assert.notEqual(result.status, 0, 'unresolved operation must refuse generation');
      assert.match(result.stderr, /fixture\.controller\.ts/u);
      if (refusal) assert.match(result.stderr, refusal);
      return;
    }
    assert.equal(result.status, 0, result.stderr);
    const contract = JSON.parse(
      readFileSync(join(fixture, 'docs', 'framework', 'contracts', 'openapi.json'), 'utf8'),
    );
    inspectContract?.(contract);
    return Object.entries(contract.paths).flatMap(([path, item]) =>
      Object.entries(item).map(([method, operation]) => ({
        method,
        path,
        isPublic: operation.security.length === 0,
        operationId: operation.operationId,
        operation,
      })),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function publicRoster(source) {
  return discover(source).map(({ method, path, isPublic }) => ({ method, path, isPublic }));
}

test('API discovery attaches Public only to its own method, preserving the following protected operation', () => {
  assert.deepEqual(
    publicRoster(`
@Controller('/probes')
export class ProbesController {
  @Public()
  @Get('/public')
  publicProbe() { return {}; }
  @Permission('probe:read')
  @Get('/protected')
  protectedProbe() { return {}; }
}
`),
    [
      { method: 'get', path: '/probes/protected', isPublic: false },
      { method: 'get', path: '/probes/public', isPublic: true },
    ],
  );
});

test('API discovery honors class Public independently of intervening source length', () => {
  assert.deepEqual(
    publicRoster(`
@Public()
@Controller('/public-class')
export class PublicController {
  constructor() { /* ${'legitimate constructor documentation '.repeat(30)} */ }
  @Get('/first')
  first() { return {}; }
  @Get('/second')
  second() { return {}; }
}
`),
    [
      { method: 'get', path: '/public-class/first', isPublic: true },
      { method: 'get', path: '/public-class/second', isPublic: true },
    ],
  );
});

test('API discovery does not turn documentation or another class Public into route authority', () => {
  assert.deepEqual(
    publicRoster(`
@Public()
@Controller('/public')
export class PublicController {
  @Get()
  open() { return {}; }
}
@Controller('/private')
export class PrivateController {
  // The @Public() example documents a different policy; this route is protected.
  @Get()
  privateRead() { return {}; }
}
`),
    [
      { method: 'get', path: '/private', isPublic: false },
      { method: 'get', path: '/public', isPublic: true },
    ],
  );
});

test('API discovery preserves PublicTenantRoute isolation and inline handler identity', () => {
  assert.deepEqual(
    discover(`
@Controller('/tenant')
export class TenantController {
  @PublicTenantRoute() @Get('/public') async publicRead() { return {}; }
  @Permission('tenant:read') @Get('/protected') async protectedRead() { return {}; }
}
`).map(({ method, path, operationId, isPublic }) => ({ method, path, operationId, isPublic })),
    [
      {
        method: 'get',
        path: '/tenant/protected',
        operationId: 'Tenant-get-tenant-protected-protectedRead',
        isPublic: false,
      },
      {
        method: 'get',
        path: '/tenant/public',
        operationId: 'Tenant-get-tenant-public-publicRead',
        isPublic: true,
      },
    ],
  );
});

test('API discovery ignores decorator-shaped comments and template text', () => {
  assert.deepEqual(
    publicRoster(
      "/* @Controller('/comment') @Get('/ghost') */\nconst text = `@Post('/ghost')`;\n@Controller('/real')\nexport class RealController {\n@Get()\nlist() { return []; }\n}\n",
    ),
    [{ method: 'get', path: '/real', isPublic: false }],
  );
});

test('API discovery resolves aliased route and public markers by their imported identities', () => {
  assert.deepEqual(
    publicRoster(`
import { Controller as Endpoint, Get as Read } from '@nestjs/common';
import { Public as Anonymous } from '@stynx-nyx/auth';
@Endpoint('/alias')
export class AliasController {
  @Anonymous() @Read() read() { return {}; }
}
`),
    [{ method: 'get', path: '/alias', isPublic: true }],
  );
});

test('API discovery expands every static path-array registration', () => {
  assert.deepEqual(
    publicRoster(`
@Controller(['/a', '/b'])
export class ArrayController {
  @Get(['first', 'second'])
  read() { return {}; }
}
`),
    ['/a/first', '/a/second', '/b/first', '/b/second'].map((path) => ({
      method: 'get',
      path,
      isPublic: false,
    })),
  );
});

test('API generation refuses unresolved ALL rather than losing its operation population', () => {
  discover(
    `
import { All } from '@nestjs/common';
@Controller('/all')
export class AllController {
  @All() all() { return {}; }
}
`,
    { refuse: true },
  );
});

test('API generation refuses computed registration values with source diagnostics', () => {
  discover(
    `
@Controller('/valid')
export class ComputedController {
  @Get(computePath()) read() { return {}; }
}
`,
    { refuse: true },
  );
});

test('API metadata preserves whole-body DTOs through renamed and namespace Body imports', () => {
  for (const parameter of [
    '@Payload() input: CreateFixtureDto',
    '@Nest.Body() input: CreateFixtureDto',
  ]) {
    const operations = discover(`
import { Body as Payload } from '@nestjs/common';
import * as Nest from '@nestjs/common';
export interface CreateFixtureDto { title: string; count: number; }
@Controller('/body')
export class BodyController {
  @Post() create(${parameter}) { return input; }
}
`);
    assert.equal(operations.length, 1);
    assert.deepEqual(operations[0].operation.requestBody, {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateFixtureDto' },
          'x-stynx-source-type': 'CreateFixtureDto',
          examples: { default: { value: { count: 1, title: 'example' } } },
        },
      },
    });
    assert.equal(operations[0].operation['x-stynx-no-request-body'], undefined);
  }
});

test('API metadata preserves whole-query object semantics through renamed and namespace Query imports', () => {
  for (const parameter of [
    '@Search() query: Record<string, unknown>',
    '@Nest.Query() query: Record<string, unknown>',
  ]) {
    const operations = discover(`
import { Query as Search } from '@nestjs/common';
import * as Nest from '@nestjs/common';
@Controller('/query')
export class QueryController {
  @Get() list(${parameter}) { return []; }
}
`);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].operation['x-stynx-query-object'], true);
    assert.equal(operations[0].operation.requestBody, undefined);
    assert.equal(operations[0].operation.parameters, undefined);
  }
});

test('API metadata preserves named query parameters through renamed and namespace Query imports', () => {
  const operations = discover(`
import { Query as Search } from '@nestjs/common';
import * as Nest from '@nestjs/common';
@Controller('/query')
export class QueryController {
  @Get() list(@Search('limit') limit?: number, @Nest.Query('cursor') cursor?: string) { return []; }
}
`);
  assert.equal(operations.length, 1);
  assert.deepEqual(
    operations[0].operation.parameters.map(({ name, in: location, required }) => ({
      name,
      location,
      required,
    })),
    [
      { name: 'cursor', location: 'query', required: false },
      { name: 'limit', location: 'query', required: false },
    ],
  );
  assert.equal(operations[0].operation['x-stynx-query-object'], undefined);
  assert.equal(operations[0].operation.requestBody, undefined);
});

test('API discovery refuses bare public/auth factory decorators rather than inventing metadata', () => {
  for (const decoration of ['@Public', '@Permission', '@PublicTenantRoute']) {
    discover(
      `
@Controller('/factory')
export class FactoryController {
  ${decoration}
  @Get() read() { return {}; }
}
`,
      { refuse: true },
    );
  }
});

test('API discovery refuses an untrusted decorator import sharing a public factory name', () => {
  discover(
    `
import { Public as HostPublic } from './untrusted-host';
@Controller('/untrusted')
export class UntrustedController {
  @HostPublic()
  @Get() read() { return {}; }
}
`,
    { refuse: true },
  );
});

const compositionPolicyPath = 'law/policy/http-api-compositions.json';
const compositionSchemaPath = 'law/schemas/http-api-compositions.schema.json';
const contractPath = 'docs/framework/contracts/openapi.json';

function writeFixtureFile(fixture, relativePath, value) {
  const target = join(fixture, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    typeof value === 'string' || Buffer.isBuffer(value)
      ? value
      : `${JSON.stringify(value, null, 2)}\n`,
  );
}

function invokeCoverage(fixture, args = ['--write-openapi', '--json'], registered = false) {
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/verify-api-coverage.mjs'), ...args],
    {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 4 * 1024 * 1024,
      env: registered
        ? {
            ...process.env,
            GIT_DIR: execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
              cwd: root,
              encoding: 'utf8',
            }).trim(),
            GIT_WORK_TREE: root,
          }
        : process.env,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}

function withRegisteredFixture(run) {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx-api-compositions-'));
  try {
    const policy = JSON.parse(readFileSync(join(root, compositionPolicyPath), 'utf8'));
    writeFixtureFile(fixture, 'package.json', { type: 'module' });
    for (const file of [compositionPolicyPath, compositionSchemaPath])
      writeFixtureFile(fixture, file, readFileSync(join(root, file)));
    const published = JSON.parse(
      execFileSync(
        'git',
        ['show', `${policy.compatibilityBaseline.commit}:${policy.compatibilityBaseline.path}`],
        { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      ),
    );
    const publishedSources = Object.values(published.paths)
      .flatMap((pathItem) =>
        Object.values(pathItem).map((operation) => operation['x-stynx-source']),
      )
      .filter(Boolean);
    const controllerSources = new Set([
      ...publishedSources,
      ...policy.operationIdCompatibility.map(({ source }) => source),
      ...policy.compositions.map(({ controller }) => controller.source),
    ]);
    for (const file of controllerSources)
      writeFixtureFile(fixture, file, readFileSync(join(root, file)));
    // Real declaration dependencies preserve each variant's DTO and return contract.
    // Published primary identities and registered alternatives form this fixture population.
    const sourceDirs = new Set(
      [...controllerSources].map((file) => file.slice(0, file.indexOf('/src/') + 4)),
    );
    function copyDependencies(relativeDir) {
      for (const entry of readdirSync(join(root, relativeDir), { withFileTypes: true })) {
        const file = `${relativeDir}/${entry.name}`;
        if (entry.isDirectory()) copyDependencies(file);
        else if (entry.isFile() && file.endsWith('.ts') && !file.endsWith('.controller.ts'))
          writeFixtureFile(fixture, file, readFileSync(join(root, file)));
      }
    }
    for (const dir of sourceDirs) copyDependencies(dir);
    return run(fixture, policy);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function readFixtureJson(fixture, file = contractPath) {
  return JSON.parse(readFileSync(join(fixture, file), 'utf8'));
}

function assertRefusesBeforeOutput(fixture, diagnostic) {
  const result = invokeCoverage(fixture, undefined, true);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, diagnostic);
  assert.equal(
    existsSync(join(fixture, contractPath)),
    false,
    'refusal must precede primary contract output',
  );
  assert.equal(
    existsSync(join(fixture, 'docs/framework/api/openapi.json')),
    false,
    'refusal must precede legacy contract output',
  );
  assert.equal(
    existsSync(join(fixture, 'docs/framework/contracts/openapi-compositions')),
    false,
    'refusal must precede every composition contract output',
  );
}

test('strict API coverage refuses changed or missing methods even when their path remains present', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx-api-method-drift-'));
  try {
    writeFixtureFile(fixture, 'package.json', { type: 'module' });
    writeFixtureFile(
      fixture,
      'packages/fixture/src/method.controller.ts',
      `
import { Controller, Get, Post } from '@nestjs/common';
@Controller('/same-path')
export class MethodController {
  @Get() read() { return {}; }
  @Post() create() { return {}; }
}
`,
    );
    const generated = invokeCoverage(fixture);
    assert.equal(generated.status, 0, generated.stderr);
    const original = readFixtureJson(fixture);
    for (const mutation of [
      (contract) => {
        contract.paths['/same-path'].put = contract.paths['/same-path'].post;
        delete contract.paths['/same-path'].post;
      },
      (contract) => {
        delete contract.paths['/same-path'].post;
      },
    ]) {
      const changed = structuredClone(original);
      mutation(changed);
      writeFixtureFile(fixture, contractPath, changed);
      const before = readFileSync(join(fixture, contractPath));
      const result = invokeCoverage(fixture, ['--strict', '--json']);
      assert.notEqual(result.status, 0, 'path-only equality must not conceal a missing method');
      const diagnostics = JSON.parse(result.stdout);
      assert.deepEqual(diagnostics.missingInCode, []);
      assert.deepEqual(diagnostics.missingInOpenApi, []);
      assert.ok(
        diagnostics.operationDrift.some(
          ({ method, path, reason }) =>
            method === 'POST' && path === '/same-path' && reason === 'missing-operation',
        ),
      );
      assert.deepEqual(
        readFileSync(join(fixture, contractPath)),
        before,
        'strict inspection must not repair its input',
      );
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('unrelated controllers sharing a method and path refuse before OpenAPI output', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx-api-collision-'));
  try {
    writeFixtureFile(fixture, 'package.json', { type: 'module' });
    for (const name of ['First', 'Second'])
      writeFixtureFile(
        fixture,
        `packages/fixture/src/${name.toLowerCase()}.controller.ts`,
        `
import { Controller, Get } from '@nestjs/common';
@Controller('/collision')
export class ${name}Controller { @Get() read() { return {}; } }
`,
      );
    const result = invokeCoverage(fixture);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /collision/iu);
    assert.equal(existsSync(join(fixture, contractPath)), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('registered E6 and CTG9 groups retain both exact contracts and an explicit E6 primary', () =>
  withRegisteredFixture((fixture, policy) => {
    const result = invokeCoverage(fixture, undefined, true);
    assert.equal(result.status, 0, result.stderr);
    const primary = readFixtureJson(fixture);
    const artifacts = new Map(
      policy.compositions.map(({ id, artifactPath }) => [
        id,
        readFixtureJson(fixture, artifactPath),
      ]),
    );
    assert.equal(policy.alternatives.length, 4);
    for (const alternative of policy.alternatives) {
      const operation = primary.paths[alternative.path][alternative.method.toLowerCase()];
      assert.equal(operation['x-stynx-composition'], 'offline-e6');
      assert.equal(operation['x-stynx-controller'], 'OfflineSyncController');
      assert.equal(
        operation['x-stynx-source'],
        'packages/offline-sync/src/offline-sync.controller.ts',
      );
      const variants = operation['x-stynx-operation-variants'];
      assert.equal(variants.length, 2);
      assert.deepEqual(variants.map((variant) => variant['x-stynx-composition']).sort(), [
        'offline-ctg9',
        'offline-e6',
      ]);
      for (const variant of variants) {
        const own = artifacts.get(variant['x-stynx-composition']).paths[alternative.path][
          alternative.method.toLowerCase()
        ];
        assert.deepEqual(
          own,
          variant,
          'composition artifact must retain the entire own operation contract',
        );
        assert.deepEqual(variant.security, [{ bearerAuth: [], tenantHeader: [] }]);
        assert.ok(variant.requestBody);
        assert.ok(variant.responses);
      }
    }
    const path = '/offline-sync/numbering-reservations';
    const e6 = artifacts.get('offline-e6');
    const ctg9 = artifacts.get('offline-ctg9');
    assert.equal(
      e6.paths[path].post.requestBody.content['application/json'].schema.$ref,
      '#/components/schemas/ReserveNumberingInput',
    );
    assert.equal(
      ctg9.paths[path].post.requestBody.content['application/json'].schema.$ref,
      '#/components/schemas/CTG9ReserveNumberingInput',
    );
    assert.notDeepEqual(e6.paths[path].post.responses, ctg9.paths[path].post.responses);
    assert.equal(e6.paths['/offline-sync/numbering-reservations/{id}/consumption'], undefined);
    assert.ok(ctg9.paths['/offline-sync/numbering-reservations/{id}/consumption'].get);
    const strict = invokeCoverage(fixture, ['--strict', '--json'], true);
    assert.equal(strict.status, 0, strict.stdout + strict.stderr);
  }));

test('all 26 published operation IDs survive while actual handler security and body metadata stay current', () =>
  withRegisteredFixture((fixture, policy) => {
    const result = invokeCoverage(fixture, undefined, true);
    assert.equal(result.status, 0, result.stderr);
    const contract = readFixtureJson(fixture);
    assert.equal(policy.operationIdCompatibility.length, 26);
    for (const entry of policy.operationIdCompatibility) {
      const operation = contract.paths[entry.path][entry.method.toLowerCase()];
      assert.equal(operation.operationId, entry.operationId);
      assert.equal(operation['x-stynx-handler'], entry.handler);
      assert.equal(operation['x-stynx-controller'], entry.className);
      assert.equal(operation['x-stynx-source'], entry.source);
    }
    assert.deepEqual(contract.paths['/_probes/readonly-write'].get.security, [
      { bearerAuth: [], tenantHeader: [] },
    ]);
    assert.deepEqual(contract.paths['/sessions'].post.security, []);
    assert.equal(
      contract.paths['/documents'].post.requestBody.content['application/json'].schema.$ref,
      '#/components/schemas/CreateDocumentDto',
    );
    assert.equal(
      contract.paths['/profile/preferences'].put.requestBody.content['application/json'].schema
        .$ref,
      '#/components/schemas/PreferenceValues',
    );
  }));

for (const [label, mutate, diagnostic] of [
  [
    'tampered immutable baseline digest',
    (policy) => {
      policy.compatibilityBaseline.sha256 = '0'.repeat(64);
    },
    /registry|baseline/iu,
  ],
  [
    'missing published operation-ID compatibility binding',
    (policy) => {
      policy.operationIdCompatibility.shift();
    },
    /Published API operation identity lost/iu,
  ],
  [
    'duplicate published operation-ID compatibility binding',
    (policy) => {
      policy.operationIdCompatibility.push({ ...policy.operationIdCompatibility[0] });
    },
    /compatibility|binding|registry/iu,
  ],
  [
    'tampered historical source digest',
    (policy) => {
      policy.operationIdCompatibility[0].baselineSourceSha256 = '0'.repeat(64);
    },
    /source digest mismatch/iu,
  ],
  [
    'unknown alternative composition',
    (policy) => {
      policy.alternatives[0].compositionIds[1] = 'not-registered';
    },
    /composition/iu,
  ],
  [
    'absent composition controller',
    (policy) => {
      policy.compositions[0].controller.className = 'AbsentController';
    },
    /controller absent/iu,
  ],
  [
    'duplicate composition identity',
    (policy) => {
      policy.compositions.push({
        ...policy.compositions[0],
        artifactPath: 'docs/framework/contracts/openapi-compositions/duplicate.json',
      });
    },
    /duplicate.*composition/iu,
  ],
  [
    'duplicate alternative operation group',
    (policy) => {
      policy.alternatives.push({ ...policy.alternatives[0], primaryCompositionId: 'offline-ctg9' });
    },
    /duplicate.*group/iu,
  ],
  [
    'unknown alternative operation group',
    (policy) => {
      policy.alternatives.push({ ...policy.alternatives[0], path: '/offline-sync/unknown' });
    },
    /declarations absent/iu,
  ],
  [
    'source path escape',
    (policy) => {
      policy.compositions[0].controller.source =
        'packages/../offline-sync/src/offline-sync.controller.ts';
    },
    /unsafe.*path/iu,
  ],
  [
    'artifact path escape',
    (policy) => {
      policy.compositions[0].artifactPath =
        'docs/framework/contracts/openapi-compositions/../escaped.json';
    },
    /registry|unsafe.*path/iu,
  ],
  [
    'route path escape',
    (policy) => {
      policy.alternatives[0].path = '/offline-sync/../escape';
    },
    /invalid.*route/iu,
  ],
]) {
  test(`registered API policy refuses ${label} before any output`, () =>
    withRegisteredFixture((fixture, policy) => {
      mutate(policy);
      writeFixtureFile(fixture, compositionPolicyPath, policy);
      assertRefusesBeforeOutput(fixture, diagnostic);
    }));
}

test('registered compatibility refuses a missing source declaration without dropping its binding', () =>
  withRegisteredFixture((fixture, policy) => {
    const entry = policy.operationIdCompatibility[0];
    const file = join(fixture, entry.source);
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('async invalidate(', 'async renamedInvalidate('),
    );
    assertRefusesBeforeOutput(fixture, /compatibility declaration missing or ambiguous/iu);
  }));

test('registered compatibility refuses ambiguous exact source class and handler declarations', () =>
  withRegisteredFixture((fixture, policy) => {
    const entry = policy.operationIdCompatibility[0];
    const source = join(fixture, entry.source);
    writeFileSync(
      source,
      `${readFileSync(source, 'utf8')}\n@Controller()\nexport class StynxAuthController { @Post('/_platform/perms/:sid/invalidate') invalidate() {} }\n`,
    );
    assertRefusesBeforeOutput(fixture, /compatibility declaration missing or ambiguous/iu);
  }));

test('strict registered API coverage refuses incomplete variants and changed composition contracts', () =>
  withRegisteredFixture((fixture, policy) => {
    const generated = invokeCoverage(fixture, undefined, true);
    assert.equal(generated.status, 0, generated.stderr);
    const primary = readFixtureJson(fixture);
    const group = policy.alternatives[0];
    const changed = structuredClone(primary);
    changed.paths[group.path][group.method.toLowerCase()]['x-stynx-operation-variants'].pop();
    writeFixtureFile(fixture, contractPath, changed);
    let result = invokeCoverage(fixture, ['--strict', '--json'], true);
    assert.notEqual(result.status, 0, 'the primary projection must not hide a missing variant');
    assert.ok(JSON.parse(result.stdout).operationDrift.some(({ path }) => path === group.path));
    writeFixtureFile(fixture, contractPath, primary);
    const composition = policy.compositions.find(({ id }) => id === 'offline-ctg9');
    const artifact = readFixtureJson(fixture, composition.artifactPath);
    artifact.paths[group.path][group.method.toLowerCase()].security = [];
    writeFixtureFile(fixture, composition.artifactPath, artifact);
    const before = readFileSync(join(fixture, composition.artifactPath));
    result = invokeCoverage(fixture, ['--strict', '--json'], true);
    assert.notEqual(result.status, 0, 'strict checks must inspect each own composition contract');
    assert.ok(
      JSON.parse(result.stdout).compositionDrift.some(
        ({ compositionId }) => compositionId === 'offline-ctg9',
      ),
    );
    assert.deepEqual(readFileSync(join(fixture, composition.artifactPath)), before);
  }));

for (const [label, target, mutate, reason] of [
  [
    'referenced request schema',
    'offline-ctg9',
    (contract) => {
      contract.components.schemas.CTG9ReserveNumberingInput.type = 'string';
    },
    'schema-components-mismatch',
  ],
  [
    'bearer security scheme',
    'offline-e6',
    (contract) => {
      contract.components.securitySchemes.bearerAuth.scheme = 'basic';
    },
    'schema-components-mismatch',
  ],
  [
    'top-level composition identity',
    'offline-ctg9',
    (contract) => {
      contract['x-stynx-composition'] = 'offline-e6';
    },
    'document-identity-mismatch',
  ],
]) {
  test(`strict registered API coverage refuses changed ${label} without rewriting artifacts`, () =>
    withRegisteredFixture((fixture, policy) => {
      const generated = invokeCoverage(fixture, undefined, true);
      assert.equal(generated.status, 0, generated.stderr);
      const selected = policy.compositions.find(({ id }) => id === target);
      const contract = readFixtureJson(fixture, selected.artifactPath);
      mutate(contract);
      writeFixtureFile(fixture, selected.artifactPath, contract);
      const before = readFileSync(join(fixture, selected.artifactPath));
      const result = invokeCoverage(fixture, ['--strict', '--json'], true);
      assert.notEqual(result.status, 0, `${label} must be part of the strict contract`);
      assert.ok(
        JSON.parse(result.stdout).compositionDrift.some(
          (failure) => failure.compositionId === target && failure.reason === reason,
        ),
        result.stdout,
      );
      assert.deepEqual(readFileSync(join(fixture, selected.artifactPath)), before);
    }));
}

test('governed API generation refuses a missing composition policy before output', () =>
  withRegisteredFixture((fixture) => {
    rmSync(join(fixture, compositionPolicyPath));
    assertRefusesBeforeOutput(fixture, /policy|registry|required|missing/iu);
  }));

test('composition schema refuses a reference with an unverified sibling constraint', () =>
  withRegisteredFixture((fixture) => {
    const schema = readFixtureJson(fixture, compositionSchemaPath);
    schema.properties.compatibilityBaseline.maxLength = 1;
    writeFixtureFile(fixture, compositionSchemaPath, schema);
    assertRefusesBeforeOutput(fixture, /reference|ref/iu);
  }));

for (const [label, paths, diagnostic] of [
  ['OpenAPI operation ID', ['a-b', 'a_b'], /Duplicate API operation ID/iu],
  ['normalized SDK service method', ['one', 'One'], /Duplicate generated SDK method identity/iu],
]) {
  test(`distinct routes refuse a colliding ${label} before any output`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'stynx-api-public-id-collision-'));
    try {
      writeFixtureFile(fixture, 'package.json', { type: 'module' });
      for (const [index, path] of paths.entries())
        writeFixtureFile(
          fixture,
          `packages/fixture/src/identity-${index}.controller.ts`,
          `
import { Controller, Get } from '@nestjs/common';
@Controller('/identity')
export class IdentityController { @Get('${path}') read() { return {}; } }
`,
        );
      const result = invokeCoverage(fixture);
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, diagnostic);
      assert.equal(existsSync(join(fixture, contractPath)), false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}

test('CTG9 reservation body preserves inherited required fields while widening only shiftId', () =>
  withRegisteredFixture((fixture) => {
    const result = invokeCoverage(fixture, undefined, true);
    assert.equal(result.status, 0, result.stderr);
    const contract = readFixtureJson(fixture);
    const legacy = contract.components.schemas.ReserveNumberingInput;
    const durable = contract.components.schemas.CTG9ReserveNumberingInput;
    assert.equal(durable.additionalProperties, false);
    assert.deepEqual(
      Object.keys(durable.properties).sort(),
      [...Object.keys(legacy.properties), 'agentId'].sort(),
    );
    assert.deepEqual(durable.properties.agentId, { type: 'string' });
    assert.equal(durable.required.includes('agentId'), false);
    assert.deepEqual(durable.required.slice().sort(), [
      'deviceId',
      'entityType',
      'orgUnitId',
      'requestedSize',
      'shiftId',
    ]);
    for (const property of Object.keys(legacy.properties).filter((name) => name !== 'shiftId'))
      assert.deepEqual(durable.properties[property], legacy.properties[property]);
    assert.deepEqual(durable.properties.shiftId, {
      anyOf: [{ type: 'string' }, { type: 'null', const: null }],
    });
    assert.deepEqual(legacy.properties.shiftId, { type: 'string' });
  }));

function withBodyContract(declarations, run) {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx-api-dto-heritage-'));
  try {
    writeFixtureFile(fixture, 'package.json', { type: 'module' });
    writeFixtureFile(
      fixture,
      'packages/fixture/src/body.controller.ts',
      `
import { Body, Controller, Post } from '@nestjs/common';
${declarations}
@Controller('/body-contract')
export class BodyContractController { @Post() create(@Body() input: Mutation) { return input; } }
`,
    );
    const result = invokeCoverage(fixture);
    return run(result, fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

for (const [label, declarations, names, required] of [
  [
    'plain interface inheritance',
    'interface Mutation extends Base { enabled: boolean; }',
    ['name', 'count', 'enabled'],
    ['name', 'enabled'],
  ],
  ['Pick selection', "type Mutation = Pick<Base, 'name'>;", ['name'], ['name']],
  ['Omit selection', "type Mutation = Omit<Base, 'name'>;", ['count'], []],
  ['Partial reference', 'type Mutation = Partial<Base>;', ['name', 'count'], []],
  [
    'Required partial reference',
    'type Mutation = Required<Partial<Base>>;',
    ['name', 'count'],
    ['name', 'count'],
  ],
]) {
  test(`actual API body schema preserves ${label} field and required semantics`, () =>
    withBodyContract(
      `interface Base { name: string; count?: number; }\n${declarations}`,
      (result, fixture) => {
        assert.equal(result.status, 0, result.stderr);
        const schema = readFixtureJson(fixture).components.schemas.Mutation;
        assert.equal(schema.type, 'object');
        assert.equal(schema.additionalProperties, false);
        assert.deepEqual(Object.keys(schema.properties).sort(), names.slice().sort());
        assert.deepEqual((schema.required ?? []).slice().sort(), required.slice().sort());
        if (names.includes('name')) assert.deepEqual(schema.properties.name, { type: 'string' });
        if (names.includes('count')) assert.deepEqual(schema.properties.count, { type: 'number' });
      },
    ));
}

for (const [label, declarations] of [
  ['missing inherited base', 'interface Mutation extends MissingBase { name: string; }'],
  [
    'unsupported non-JSON inheritance',
    'interface Mutation extends Map<string, { name: string }> {}',
  ],
]) {
  test(`actual API body schema refuses ${label} rather than emitting an incomplete closed object`, () =>
    withBodyContract(declarations, (result, fixture) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /inherit|base|unsupported|unresolved|schema/iu);
      assert.equal(existsSync(join(fixture, contractPath)), false);
    }));
}

function resolveLocalSchema(schema, schemas) {
  const visited = new Set();
  while (schema.$ref) {
    assert.match(schema.$ref, /^#\/components\/schemas\//u);
    assert.equal(visited.has(schema.$ref), false, 'fixture field schema must resolve');
    visited.add(schema.$ref);
    schema = schemas[schema.$ref.split('/').at(-1)];
    assert.ok(schema, 'referenced field schema missing');
  }
  return schema;
}

function nullableObject(schema, schemas) {
  schema = resolveLocalSchema(schema, schemas);
  const alternatives = schema.anyOf ?? [schema];
  assert.ok(alternatives.some((candidate) => candidate.type === 'null'));
  const object = alternatives
    .map((candidate) => resolveLocalSchema(candidate, schemas))
    .find((candidate) => candidate.type === 'object');
  assert.ok(object, 'nullable category must retain its concrete object fields');
  assert.equal(object.additionalProperties, false);
  assert.deepEqual(object.required ?? [], []);
  return object;
}

function assertNullableScalar(schema, schemas, type) {
  schema = resolveLocalSchema(schema, schemas);
  assert.ok(schema.anyOf.some((candidate) => candidate.type === 'null'));
  assert.ok(schema.anyOf.some((candidate) => candidate.type === type));
}

test('actual PreferencePatch body retains finite categories nullable reset values and typed nested fields', () =>
  withRegisteredFixture((fixture) => {
    const result = invokeCoverage(fixture, undefined, true);
    assert.equal(result.status, 0, result.stderr);
    const schemas = readFixtureJson(fixture).components.schemas;
    const patch = resolveLocalSchema(schemas.PreferencePatch, schemas);
    assert.equal(patch.type, 'object');
    assert.equal(patch.additionalProperties, false, 'unknown categories must be refused');
    assert.deepEqual(patch.required ?? [], []);
    assert.deepEqual(Object.keys(patch.properties).sort(), [
      'accessibility',
      'locale',
      'notificationDelivery',
      'theme',
    ]);
    const locale = nullableObject(patch.properties.locale, schemas);
    assert.deepEqual(Object.keys(locale.properties).sort(), ['locale', 'timezone']);
    assertNullableScalar(locale.properties.locale, schemas, 'string');
    assertNullableScalar(locale.properties.timezone, schemas, 'string');
    const notifications = nullableObject(patch.properties.notificationDelivery, schemas);
    assert.deepEqual(Object.keys(notifications.properties).sort(), ['email', 'inApp', 'push']);
    for (const schema of Object.values(notifications.properties))
      assertNullableScalar(schema, schemas, 'boolean');
    const accessibility = nullableObject(patch.properties.accessibility, schemas);
    assert.deepEqual(Object.keys(accessibility.properties).sort(), [
      'largeText',
      'reduceMotion',
      'screenReaderOptimized',
    ]);
    for (const schema of Object.values(accessibility.properties))
      assertNullableScalar(schema, schemas, 'boolean');
    const theme = nullableObject(patch.properties.theme, schemas);
    const color = resolveLocalSchema(theme.properties.colorScheme, schemas);
    assert.ok(color.anyOf.some((candidate) => candidate.type === 'null'));
    const choices = color.anyOf
      .filter((candidate) => candidate.type !== 'null')
      .flatMap((candidate) => candidate.enum ?? [candidate.const]);
    assert.deepEqual(choices.sort(), ['dark', 'light', 'system']);
  }));

test('finite mapped indexed and keyof body types preserve each selected nested field', () =>
  withBodyContract(
    `
type Category = 'locale' | 'delivery';
interface Values { locale: { language: string; zone: string }; delivery: { enabled: boolean } }
type Mutation = { [K in Category]?: { [P in keyof Values[K]]?: Values[K][P] | null } | null };
`,
    (result, fixture) => {
      assert.equal(result.status, 0, result.stderr);
      const schemas = readFixtureJson(fixture).components.schemas;
      const mutation = resolveLocalSchema(schemas.Mutation, schemas);
      assert.equal(mutation.additionalProperties, false);
      assert.deepEqual(mutation.required ?? [], []);
      assert.deepEqual(Object.keys(mutation.properties).sort(), ['delivery', 'locale']);
      const locale = nullableObject(mutation.properties.locale, schemas);
      assert.deepEqual(Object.keys(locale.properties).sort(), ['language', 'zone']);
      for (const field of Object.values(locale.properties))
        assertNullableScalar(field, schemas, 'string');
      const delivery = nullableObject(mutation.properties.delivery, schemas);
      assert.deepEqual(Object.keys(delivery.properties), ['enabled']);
      assertNullableScalar(delivery.properties.enabled, schemas, 'boolean');
    },
  ));

test('chained object aliases in intersections retain a valid joined closed body', () =>
  withBodyContract(
    'interface Base { name: string; } type First = Base; type Second = First; type Mutation = Second & { count: number };',
    (result, fixture) => {
      assert.equal(result.status, 0, result.stderr);
      const schema = readFixtureJson(fixture).components.schemas.Mutation;
      assert.equal(schema.type, 'object');
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.properties, { count: { type: 'number' }, name: { type: 'string' } });
      assert.deepEqual(schema.required.slice().sort(), ['count', 'name']);
    },
  ));

for (const [label, declaration] of [
  [
    'two conflicting open index constraints',
    'type Mutation = Record<string, string> & Record<string, number>;',
  ],
  [
    'an open index constraint incompatible with a declared property',
    'type Mutation = Record<string, string> & { count: number };',
  ],
  [
    'generic inherited substitution that is unsupported',
    'interface Box<T> { value: T; } interface Mutation extends Box<string> {}',
  ],
]) {
  test(`API body composition refuses ${label} instead of silently dropping a constraint`, () =>
    withBodyContract(declaration, (result, fixture) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /intersection|index|inherit|generic|unsupported|schema/iu);
      assert.equal(existsSync(join(fixture, contractPath)), false);
    }));
}

test('body schema retains legal Object prototype field names as own typed properties', () =>
  withBodyContract(
    'interface Base { toString: string; __proto__: number; constructor: boolean } interface Mutation extends Base { enabled: boolean }',
    (result, fixture) => {
      assert.equal(result.status, 0, result.stderr);
      const schema = readFixtureJson(fixture).components.schemas.Mutation;
      assert.deepEqual(Object.keys(schema.properties).sort(), [
        '__proto__',
        'constructor',
        'enabled',
        'toString',
      ]);
      for (const [name, type] of [
        ['toString', 'string'],
        ['__proto__', 'number'],
        ['constructor', 'boolean'],
        ['enabled', 'boolean'],
      ]) {
        assert.equal(Object.hasOwn(schema.properties, name), true);
        assert.deepEqual(schema.properties[name], { type });
      }
      assert.deepEqual(schema.required.slice().sort(), [
        '__proto__',
        'constructor',
        'enabled',
        'toString',
      ]);
    },
  ));

test('unconstrained JSON index composition preserves health-style declared fields and open JSON values', () =>
  withBodyContract(
    'type Mutation = { count: number; label?: string } & Record<string, unknown>;',
    (result, fixture) => {
      assert.equal(result.status, 0, result.stderr);
      const schema = readFixtureJson(fixture).components.schemas.Mutation;
      assert.equal(schema.type, 'object');
      assert.deepEqual(schema.properties, { count: { type: 'number' }, label: { type: 'string' } });
      assert.deepEqual(schema.required, ['count']);
      assert.ok(
        schema.additionalProperties === true ||
          schema.additionalProperties.$ref === '#/components/schemas/JsonValue',
        'the unconstrained JSON index must remain open without erasing named field types',
      );
    },
  ));

test('JWKS-style compatible string index composition retains named key constraints', () =>
  withBodyContract(
    "type Mutation = { keys: Array<Record<string, string | undefined> & { kid: string; use: 'sig'; alg: 'RS256' }> };",
    (result, fixture) => {
      assert.equal(result.status, 0, result.stderr);
      const schema = readFixtureJson(fixture).components.schemas.Mutation;
      assert.equal(schema.properties.keys.type, 'array');
      const key = schema.properties.keys.items;
      assert.equal(key.type, 'object');
      assert.deepEqual(key.properties.kid, { type: 'string' });
      assert.deepEqual(key.properties.use, { type: 'string', const: 'sig' });
      assert.deepEqual(key.properties.alg, { type: 'string', const: 'RS256' });
      assert.deepEqual(key.required.slice().sort(), ['alg', 'kid', 'use']);
      const allowedExtras = key.additionalProperties;
      assert.ok(
        allowedExtras.type === 'string' ||
          (allowedExtras.anyOf?.length === 1 && allowedExtras.anyOf[0].type === 'string'),
        'extra JWK members must remain string-constrained',
      );
    },
  ));

test('composition schema refuses an inherited Object prototype name as a missing local definition', () =>
  withRegisteredFixture((fixture) => {
    const schema = readFixtureJson(fixture, compositionSchemaPath);
    schema.properties.compatibilityBaseline = { $ref: '#/$defs/toString' };
    writeFixtureFile(fixture, compositionSchemaPath, schema);
    assertRefusesBeforeOutput(fixture, /reference|ref/iu);
  }));

test('finite Record body keys remain required closed string properties', () =>
  withBodyContract("type Mutation = Record<'id' | 'name', string>;", (result, fixture) => {
    assert.equal(result.status, 0, result.stderr);
    const schema = readFixtureJson(fixture).components.schemas.Mutation;
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.properties, { id: { type: 'string' }, name: { type: 'string' } });
    assert.deepEqual(schema.required.slice().sort(), ['id', 'name']);
  }));

test('unbounded numeric Record body keys refuse instead of widening to arbitrary string keys', () =>
  withBodyContract('type Mutation = Record<number, string>;', (result, fixture) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Record|key|unsupported|schema/iu);
    assert.equal(existsSync(join(fixture, contractPath)), false);
  }));


// ADR0034: source return values and JSON wire values are distinct contracts.
const annotatedResponseDeclarations = `
export interface DirectAuditItem { occurredAt: string | number; }
export interface DirectAuditPage { items: DirectAuditItem[]; nextCursor?: string; }
export interface WireAuditItem { occurredAt: string | null; }
export interface WireAuditPage { items: WireAuditItem[]; nextCursor?: string; }
`;

function annotatedResponseSource(annotation = '@stynx-json-response-type WireAuditPage', declarations = annotatedResponseDeclarations) {
  return `${declarations}
@Controller('/_audit')
export class AuditProbeController {
  /** ${annotation} */
  @Get('/log')
  list(): Promise<DirectAuditPage> { throw new Error('discovery must not execute controller code'); }
}
@Controller('/audit')
export class AngularAuditProbeController {
  @Get('/events')
  events(): DirectAuditPage { throw new Error('discovery must not execute controller code'); }
}
`;
}

test('method JSON response annotation separates direct metadata from nullable wire schema without widening another route', () => {
  discover(annotatedResponseSource(), {
    inspectContract(contract) {
      const media = contract.paths['/_audit/log'].get.responses['200'].content['application/json'];
      assert.equal(media['x-stynx-source-type'], 'Promise<DirectAuditPage>');
      assert.equal(media['x-stynx-json-response-type'], 'WireAuditPage');
      assert.deepEqual(media.schema, { $ref: '#/components/schemas/WireAuditPage' });
      const schemas = contract.components.schemas;
      assert.deepEqual(schemas.WireAuditPage.properties.items.items, { $ref: '#/components/schemas/WireAuditItem' });
      assert.deepEqual(schemas.WireAuditItem.properties.occurredAt, {
        anyOf: [{ type: 'string' }, { type: 'null', const: null }],
      });
      const ordinary = contract.paths['/audit/events'].get.responses['200'].content['application/json'];
      assert.equal(ordinary['x-stynx-source-type'], 'DirectAuditPage');
      assert.equal(Object.hasOwn(ordinary, 'x-stynx-json-response-type'), false);
      assert.deepEqual(ordinary.schema, { $ref: '#/components/schemas/DirectAuditPage' });
      assert.deepEqual(schemas.DirectAuditItem.properties.occurredAt, {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      });
    },
  });
});

for (const [name, annotation, declarations] of [
  ['empty annotation', '@stynx-json-response-type', annotatedResponseDeclarations],
  ['duplicate annotation', '@stynx-json-response-type WireAuditPage\n   * @stynx-json-response-type WireAuditPage', annotatedResponseDeclarations],
  ['generic expression', '@stynx-json-response-type WireAuditPage<string>', annotatedResponseDeclarations],
  ['missing declaration', '@stynx-json-response-type MissingPage', annotatedResponseDeclarations],
  ['UnknownJson escape', '@stynx-json-response-type UnknownJson', annotatedResponseDeclarations],
  ['generic declaration', '@stynx-json-response-type GenericPage', annotatedResponseDeclarations + 'export interface GenericPage<T> { item: T; }'],
  ['unresolved nested declaration', '@stynx-json-response-type WireAuditPage', annotatedResponseDeclarations.replace('items: WireAuditItem[]', 'items: MissingNested[]')],
  ['ambiguous declaration', '@stynx-json-response-type WireAuditPage', annotatedResponseDeclarations + 'export interface WireAuditPage { unexpected: boolean; }'],
]) {
  test(`JSON response annotation refuses ${name}`, () => {
    discover(annotatedResponseSource(annotation, declarations), { refuse: true, refusal: /JSON response/iu });
  });
}

for (const [name, source] of [
  ['non-route method', `${annotatedResponseDeclarations}
@Controller('/probe') export class Probe {
  /** @stynx-json-response-type WireAuditPage */
  helper(): DirectAuditPage { throw new Error('not a route'); }
  @Get() read(): DirectAuditPage { throw new Error('not executed'); }
}`],
  ['parameter annotation', `${annotatedResponseDeclarations}
@Controller('/probe') export class Probe {
  @Post() write(/** @stynx-json-response-type WireAuditPage */ body: DirectAuditPage): DirectAuditPage { return body; }
}`],
  ['request DTO annotation', `${annotatedResponseDeclarations}
/** @stynx-json-response-type WireAuditPage */
export interface RequestBody { value: string; }
@Controller('/probe') export class Probe { @Post() write(body: RequestBody): DirectAuditPage { throw new Error('not executed'); } }
`],
]) {
  test(`JSON response annotation refuses ${name}`, () => discover(source, { refuse: true, refusal: /JSON response/iu }));
}

test('annotation-shaped strings and ordinary comments do not override source response metadata', () => {
  const source = annotatedResponseSource().replace(
    '/** @stynx-json-response-type WireAuditPage */',
    '// @stynx-json-response-type WireAuditPage',
  ) + "\nconst example = '@stynx-json-response-type WireAuditPage';\n";
  const operations = discover(source);
  const media = operations.find((operation) => operation.path === '/_audit/log').operation.responses['200'].content['application/json'];
  assert.equal(Object.hasOwn(media, 'x-stynx-json-response-type'), false);
  assert.deepEqual(media.schema, { $ref: '#/components/schemas/DirectAuditPage' });
});
