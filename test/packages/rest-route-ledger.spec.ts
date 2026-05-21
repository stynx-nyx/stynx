import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

const expectedRoutes: Record<string, string[]> = {
  'domain/demo-bookmark/api/src/demo-bookmark/controllers/bookmark-tag.controller.ts': [
    'GET /api/demo/bookmark/bookmark-tag',
    'POST /api/demo/bookmark/bookmark-tag',
    'DELETE /api/demo/bookmark/bookmark-tag/:bookmark_id/:tag',
  ],
  'domain/demo-bookmark/api/src/demo-bookmark/controllers/bookmark.controller.ts': [
    'GET /api/demo/bookmark/bookmark',
    'GET /api/demo/bookmark/bookmark/:id',
    'POST /api/demo/bookmark/bookmark',
    'PATCH /api/demo/bookmark/bookmark/:id',
    'DELETE /api/demo/bookmark/bookmark/:id',
  ],
  'packages/audit/src/audit.controller.ts': ['GET /_audit/log'],
  'packages/auth/src/auth.controller.ts': [
    'POST /sessions',
    'POST /sessions/switch',
    'POST /sessions/logout',
    'GET /_platform/perms/:sid',
    'POST /_platform/perms/:sid/invalidate',
  ],
  'packages/flow/src/controllers/agent-rules.controller.ts': [
    'GET /flow/agent-rules/:id',
    'PATCH /flow/agent-rules/:id',
    'DELETE /flow/agent-rules/:id',
  ],
  'packages/flow/src/controllers/analytics.controller.ts': [
    'GET /flow/open-tasks',
    'GET /flow/analytics/dashboard',
  ],
  'packages/flow/src/controllers/answers.controller.ts': [
    'PATCH /flow/answers/:id',
    'DELETE /flow/answers/:id',
  ],
  'packages/flow/src/controllers/edges.controller.ts': [
    'GET /flow/edges/:id',
    'PATCH /flow/edges/:id',
    'DELETE /flow/edges/:id',
  ],
  'packages/flow/src/controllers/effects.controller.ts': ['POST /flow/effects/dispatch'],
  'packages/flow/src/controllers/events.controller.ts': ['GET /flow/events'],
  'packages/flow/src/controllers/fills.controller.ts': [
    'GET /flow/fills',
    'GET /flow/fills/:id',
    'POST /flow/fills',
    'PATCH /flow/fills/:id',
    'DELETE /flow/fills/:id',
    'GET /flow/fills/:fillId/answers',
    'POST /flow/fills/:fillId/answers',
    'PUT /flow/fills/:fillId/answers',
    'POST /flow/fills/:fillId/waivers',
    'GET /flow/fills/:fillId/waivers',
  ],
  'packages/flow/src/controllers/forms.controller.ts': [
    'GET /flow/forms',
    'GET /flow/forms/:id',
    'POST /flow/forms',
    'PATCH /flow/forms/:id',
    'DELETE /flow/forms/:id',
    'GET /flow/forms/:formId/questions',
    'POST /flow/forms/:formId/questions',
    'GET /flow/forms/:formId/fills',
    'GET /flow/forms/:formId/fills/:fillId',
    'GET /flow/forms/:formId/fills/:fillId/answers',
    'GET /flow/forms/:formId/fills/:fillId/waivers',
    'POST /flow/forms/:formId/fills',
    'POST /flow/forms/:formId/fills/:fillId/waivers',
  ],
  'packages/flow/src/controllers/graphs.controller.ts': [
    'GET /flow/graphs',
    'GET /flow/graphs/:id',
    'GET /flow/graphs/:id/export',
    'POST /flow/graphs',
    'POST /flow/graphs/import',
    'PATCH /flow/graphs/:id',
    'POST /flow/graphs/:id/publish',
    'DELETE /flow/graphs/:id',
    'GET /flow/graphs/:graphId/nodes',
    'POST /flow/graphs/:graphId/nodes',
    'GET /flow/graphs/:graphId/edges',
    'POST /flow/graphs/:graphId/edges',
    'GET /flow/graphs/:graphId/transition-effects',
    'POST /flow/graphs/:graphId/transition-effects',
  ],
  'packages/flow/src/controllers/node-form-rules.controller.ts': [
    'GET /flow/node-form-rules/:id',
    'PATCH /flow/node-form-rules/:id',
    'DELETE /flow/node-form-rules/:id',
  ],
  'packages/flow/src/controllers/node-runs.controller.ts': [
    'GET /flow/node-runs',
    'GET /flow/node-runs/:id',
  ],
  'packages/flow/src/controllers/nodes.controller.ts': [
    'GET /flow/nodes/:id',
    'PATCH /flow/nodes/:id',
    'DELETE /flow/nodes/:id',
    'GET /flow/nodes/:nodeId/agent-rules',
    'POST /flow/nodes/:nodeId/agent-rules',
    'GET /flow/nodes/:nodeId/form-rules',
    'POST /flow/nodes/:nodeId/form-rules',
  ],
  'packages/flow/src/controllers/policies.controller.ts': [
    'GET /flow/policies/sets',
    'GET /flow/policies/sets/:id',
    'POST /flow/policies/sets',
    'PATCH /flow/policies/sets/:id',
    'DELETE /flow/policies/sets/:id',
    'GET /flow/policies/sets/:policySetId/rules',
    'POST /flow/policies/sets/:policySetId/rules',
    'GET /flow/policies/rules/:id',
    'PATCH /flow/policies/rules/:id',
    'DELETE /flow/policies/rules/:id',
    'POST /flow/policies/evaluate',
  ],
  'packages/flow/src/controllers/questions.controller.ts': [
    'GET /flow/questions/:id',
    'PATCH /flow/questions/:id',
    'DELETE /flow/questions/:id',
    'GET /flow/questions/:id/score',
    'PUT /flow/questions/:id/score',
    'DELETE /flow/questions/:id/score',
  ],
  'packages/flow/src/controllers/runs.controller.ts': [
    'GET /flow/runs',
    'POST /flow/runs/ensure',
    'GET /flow/runs/summary',
    'GET /flow/runs/:id',
    'PATCH /flow/runs/:id',
    'GET /flow/runs/:id/nodes',
    'GET /flow/runs/:id/tasks',
    'GET /flow/runs/:id/events',
    'GET /flow/runs/:id/activity',
    'GET /flow/runs/:id/facts',
  ],
  'packages/flow/src/controllers/scopes.controller.ts': [
    'GET /flow/scopes',
    'GET /flow/scopes/:id',
    'POST /flow/scopes',
    'PATCH /flow/scopes/:id',
    'DELETE /flow/scopes/:id',
  ],
  'packages/flow/src/controllers/signal.controller.ts': ['POST /flow/signal'],
  'packages/flow/src/controllers/tasks.controller.ts': [
    'GET /flow/tasks',
    'GET /flow/tasks/:id',
    'GET /flow/tasks/:id/candidates',
    'GET /flow/tasks/roles/:role/users',
    'GET /flow/tasks/users/:id',
    'POST /flow/tasks/:id/act',
    'POST /flow/tasks/:id/accept',
    'POST /flow/tasks/:id/decline',
    'POST /flow/tasks/:id/unaccept',
    'POST /flow/tasks/:id/withdraw',
    'POST /flow/tasks/:id/assign',
    'POST /flow/tasks/:id/unassign',
  ],
  'packages/flow/src/controllers/transition-effects.controller.ts': [
    'GET /flow/transition-effects/:id',
    'PATCH /flow/transition-effects/:id',
    'DELETE /flow/transition-effects/:id',
  ],
  'packages/flow/src/controllers/waivers.controller.ts': [
    'GET /flow/waivers',
    'POST /flow/waivers',
    'PATCH /flow/waivers/:id',
    'DELETE /flow/waivers/:id',
  ],
  'packages/health/src/health.controller.ts': [
    'GET /healthz',
    'GET /readyz',
    'GET /metrics',
    'GET /info',
  ],
  'packages/i18n/src/i18n.controller.ts': [
    'GET /_tenancy/i18n/overrides',
    'PUT /_tenancy/i18n/overrides',
  ],
  'packages/privacy/src/privacy.controller.ts': [
    'POST /privacy/exports',
    'POST /privacy/erasures',
    'GET /privacy/retention',
  ],
  'packages/sessions/src/jwks.controller.ts': ['GET /.well-known/jwks.json'],
  'packages/tenancy/src/tenancy.controller.ts': [
    'GET /tenants',
    'GET /tenants/:id',
    'POST /tenants',
    'PATCH /tenants/:id',
    'POST /tenants/:id/suspend',
    'POST /tenants/:id/archive',
    'POST /tenants/:id/purge',
  ],
  'reference/api/src/sample/documents.controller.ts': [
    'POST /documents',
    'POST /documents/:id/complete',
    'GET /documents/:id/download',
    'DELETE /documents/:id',
    'POST /documents/:id/restore',
    'DELETE /documents/:id/hard',
  ],
  'reference/api/src/sample/record-notes.controller.ts': [
    'GET /record-notes',
    'GET /record-notes/:id',
    'POST /record-notes',
    'PATCH /record-notes/:id',
    'DELETE /record-notes/:id',
    'POST /record-notes/:id/restore',
    'DELETE /record-notes/:id/hard',
  ],
  'reference/api/src/sample/records.controller.ts': [
    'GET /records',
    'GET /records/trash',
    'GET /records/:id',
    'POST /records',
    'PATCH /records/:id',
    'DELETE /records/:id',
    'POST /records/:id/restore',
    'DELETE /records/:id/hard',
  ],
  'reference/api/src/sample/reference-dev-auth.controller.ts': [
    'GET /_reference/demo-tenants',
    'POST /_reference/dev-login',
    'GET /_reference/auth-verify',
  ],
  'reference/api/src/sample/reference-probes.controller.ts': [
    'GET /_probes/data-tx',
    'GET /_probes/ratelimit',
    'POST /_probes/idempotency',
    'GET /_probes/readonly-write',
  ],
  'reference/api/src/sample/work-item-entries.controller.ts': [
    'GET /work-item-entries',
    'GET /work-item-entries/:id',
    'POST /work-item-entries',
    'PATCH /work-item-entries/:id',
    'DELETE /work-item-entries/:id',
    'POST /work-item-entries/:id/restore',
    'DELETE /work-item-entries/:id/hard',
  ],
  'reference/api/src/sample/work-item-locks.controller.ts': [
    'GET /work-item-locks',
    'GET /work-item-locks/:id',
    'POST /work-item-locks',
    'PATCH /work-item-locks/:id',
    'DELETE /work-item-locks/:id',
    'POST /work-item-locks/:id/restore',
    'DELETE /work-item-locks/:id/hard',
  ],
  'reference/api/src/sample/work-items.controller.ts': [
    'GET /work-items',
    'GET /work-items/trash',
    'GET /work-items/:id',
    'POST /work-items',
    'PATCH /work-items/:id',
    'DELETE /work-items/:id',
    'POST /work-items/:id/restore',
    'DELETE /work-items/:id/hard',
  ],
};

const verbByDecorator = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
  ['All', 'ALL'],
  ['Head', 'HEAD'],
  ['Options', 'OPTIONS'],
]);

function literalValue(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^['"`](.*)['"`]$/, '$1');
}

function routePath(base: string, path: string): string {
  return `/${literalValue(base)}/${literalValue(path)}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function actualRoutes(relativePath: string): string[] {
  const source = readFileSync(resolve(repoRoot, relativePath), 'utf8');
  const controllerPath = source.match(/@Controller\(([^)]*)\)/)?.[1];
  const routes = [...source.matchAll(/@(Get|Post|Put|Patch|Delete|All|Head|Options)\(([^)]*)\)/g)]
    .map((match) => `${verbByDecorator.get(match[1])} ${routePath(controllerPath ?? '', match[2])}`)
    .sort();

  return routes;
}

describe('REST route coverage ledger', () => {
  it('declares every production controller route as a named test obligation', () => {
    const controllerFiles = Object.keys(expectedRoutes).sort();

    expect(controllerFiles).toHaveLength(37);
    expect(Object.values(expectedRoutes).flat()).toHaveLength(194);

    for (const file of controllerFiles) {
      expect(actualRoutes(file)).toEqual([...expectedRoutes[file]].sort());
    }
  });
});
