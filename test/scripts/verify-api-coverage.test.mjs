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

function discover(source, { refuse = false } = {}) {
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
      return;
    }
    assert.equal(result.status, 0, result.stderr);
    const contract = JSON.parse(
      readFileSync(join(fixture, 'docs', 'framework', 'contracts', 'openapi.json'), 'utf8'),
    );
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
