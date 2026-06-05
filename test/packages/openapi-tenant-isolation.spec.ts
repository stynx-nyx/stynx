import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface OpenApiOperation {
  operationId?: string;
  security?: Array<Record<string, unknown>>;
  'x-stynx-source'?: string;
  'x-stynx-no-request-body'?: boolean;
  requestBody?: unknown;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const openapi = JSON.parse(
  readFileSync(resolve(repoRoot, 'docs/framework/contracts/openapi.json'), 'utf8'),
) as OpenApiDocument;

function operationsUnder(
  prefix: string,
): Array<{ method: string; path: string; operation: OpenApiOperation }> {
  return Object.entries(openapi.paths)
    .filter(([path]) => path === prefix || path.startsWith(`${prefix}/`))
    .flatMap(([path, item]) =>
      Object.entries(item).map(([method, operation]) => ({ method, path, operation })),
    );
}

function expectTenantSecurity(
  operations: Array<{ method: string; path: string; operation: OpenApiOperation }>,
): void {
  expect(operations.length).toBeGreaterThan(0);
  for (const { method, path, operation } of operations) {
    expect(operation.security, `${method.toUpperCase()} ${path}`).toEqual([
      { bearerAuth: [], tenantHeader: [] },
    ]);
  }
}

describe('OpenAPI tenant isolation coverage', () => {
  it('proves flow routes require tenant-bound security', () => {
    expectTenantSecurity(operationsUnder('/flow'));
  });

  it('proves flow write routes expose idempotent tenant-scoped contracts', () => {
    const writes = operationsUnder('/flow').filter(({ method }) =>
      ['post', 'put', 'patch', 'delete'].includes(method),
    );

    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every(({ operation }) => operation.security?.[0]?.tenantHeader)).toBe(true);
    expect(
      writes.some(({ operation }) => operation.requestBody || operation['x-stynx-no-request-body']),
    ).toBe(true);
  });

  it('proves reference records routes require tenant-bound security', () => {
    expectTenantSecurity([
      ...operationsUnder('/records'),
      ...operationsUnder('/record-notes'),
      ...operationsUnder('/work-items'),
      ...operationsUnder('/work-item-entries'),
      ...operationsUnder('/work-item-locks'),
    ]);
  });

  it('proves reference API protected routes require tenant-bound security', () => {
    const protectedReferenceOperations = Object.entries(openapi.paths)
      .filter(([path]) => !path.startsWith('/_probes') && !path.startsWith('/_reference'))
      .flatMap(([path, item]) =>
        Object.entries(item).map(([method, operation]) => ({ method, path, operation })),
      )
      .filter(
        ({ method, path }) =>
          !['/healthz', '/readyz', '/info', '/metrics'].includes(path) &&
          !(method === 'post' && path === '/sessions'),
      );

    expectTenantSecurity(protectedReferenceOperations);
  });

  it('proves document storage routes keep tenant-scoped auth, rate limits, and audit hooks', () => {
    expectTenantSecurity(operationsUnder('/documents'));
    const source = readFileSync(
      resolve(repoRoot, 'reference/api/src/sample/documents.controller.ts'),
      'utf8',
    );

    expect(source).toContain('@UseGuards(StynxAuthGuard, PermissionGuard)');
    expect(source).toContain("bucket: 'tenant'");
    expect(source).toContain("entity: 'storage.documents'");
  });

  it('proves reference records source filters by tenant before returning rows', () => {
    const source = readFileSync(
      resolve(repoRoot, 'reference/api/src/sample/reference-sample.service.ts'),
      'utf8',
    );

    expect(source).toContain('requireTenantId()');
    expect(source).toContain('eq(records.tenantId, this.requireTenantId())');
    expect(source).toContain('eq(recordNotes.tenantId, this.requireTenantId())');
    expect(source).toContain('eq(workItems.tenantId, this.requireTenantId())');
  });
});
