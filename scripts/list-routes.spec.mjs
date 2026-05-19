import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { collectRoutes, formatCsv, formatReport } from './list-routes.mjs';

function writeFixtureController(workspace) {
  const packageDir = join(workspace, 'packages', 'alpha');
  const srcDir = join(packageDir, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(packageDir, 'package.json'),
    `${JSON.stringify({ name: '@fixture/alpha' }, null, 2)}\n`,
  );
  writeFileSync(
    join(srcDir, 'alpha.controller.ts'),
    `
import { Controller, Get, Post } from '@nestjs/common';

@Controller('/alpha')
export class AlphaController {
  @Permission('alpha:read')
  @Get()
  list() {
    return [];
  }

  @Post(':id')
  @RateLimit({
    bucket: 'tenant',
    scope: 'alpha.create',
  })
  @Permission('alpha:write')
  create() {
    return {};
  }
}
`,
  );
}

test('collectRoutes inventories controller base paths, method paths, permissions, and rate limits', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-list-routes-'));
  try {
    writeFixtureController(workspace);

    const routes = collectRoutes({ repoRoot: workspace });

    assert.deepEqual(routes.map((route) => [route.method, route.path]), [
      ['GET', '/alpha'],
      ['POST', '/alpha/:id'],
    ]);
    assert.deepEqual(routes.map((route) => route.permissions), ['alpha:read', 'alpha:write']);
    assert.equal(routes[1].rateLimitClass, 'tenant:alpha.create');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('collectRoutes supports package and controller filters', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-list-routes-'));
  try {
    writeFixtureController(workspace);

    assert.equal(collectRoutes({ repoRoot: workspace, packageFilter: 'alpha' }).length, 2);
    assert.equal(collectRoutes({ repoRoot: workspace, controllerFilter: 'AlphaController' }).length, 2);
    assert.equal(collectRoutes({ repoRoot: workspace, packageFilter: 'beta' }).length, 0);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('formatters emit the W2 CSV and report shapes', () => {
  const routes = [
    {
      package: '@fixture/alpha',
      controller: 'AlphaController',
      method: 'GET',
      path: '/alpha',
      permissions: 'alpha:read',
      rateLimitClass: '',
    },
  ];

  assert.equal(
    formatCsv(routes),
    'package,controller,method,path,permissions,rate-limit-class\n@fixture/alpha,AlphaController,GET,/alpha,alpha:read,\n',
  );
  assert.match(formatReport(routes), /total-routes: 1\ncontrollers: 1\n/);
  assert.match(formatReport(routes), /@fixture\/alpha: 1\n/);
});
