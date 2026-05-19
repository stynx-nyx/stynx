import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PermissionCache, PermissionGuard, StynxAuthGuard, StynxJwtValidator } from '@stynx/auth';
import { StynxDataModule } from '@stynx/data';
import { SessionService } from '@stynx/sessions';
import { BookmarkController } from '../src/demo-bookmark/controllers/bookmark.controller';
import { BookmarkTagController } from '../src/demo-bookmark/controllers/bookmark-tag.controller';
import { BookmarkService } from '../src/demo-bookmark/services/bookmark.service';
import { BookmarkTagService } from '../src/demo-bookmark/services/bookmark-tag.service';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../../packages/data/test/support/postgres';

const READ_TOKEN = 'reader';
const WRITE_TOKEN = 'writer';
const VIEWER_TOKEN = 'viewer';
const TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ACTOR_ID = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const UNKNOWN_UUID = '0197481e-ffff-7fff-8fff-ffffffffffff';

interface HttpResult {
  status: number;
  body: unknown;
  headers: Headers;
}

function tokenPermissions(token: string): string[] {
  if (token === READ_TOKEN) return ['demo:bookmark:read'];
  if (token === WRITE_TOKEN) return ['demo:bookmark:write'];
  return [];
}

async function seedBaseState(database: PostgresTestDatabase): Promise<void> {
  const client = await database.connectAsAdmin();
  try {
    await client.query('set role stynx_app');
    await client.query('begin');
    await client.query(`select set_config('app.tenant_id', $1, true)`, [TENANT_ID]);
    await client.query(
      `insert into tenancy.tenants (id, slug, name) values ($1, $2, $3) on conflict do nothing`,
      [TENANT_ID, 'bookmark-api-matrix', 'Bookmark API Matrix'],
    );
    await client.query('commit');
    await client.query(
      `insert into auth.users (id, email) values ($1, $2) on conflict do nothing`,
      [ACTOR_ID, 'bookmark-api-matrix@example.test'],
    );
    await client.query('reset role');
  } finally {
    await client.end();
  }
}

async function applyDemoMigration(database: PostgresTestDatabase): Promise<void> {
  const migrationPath = join(__dirname, '..', '..', 'db', 'migration.sql');
  const migrationSql = readFileSync(migrationPath, 'utf8');
  const client = await database.connectAsAdmin();
  try {
    await client.query('set role stynx_owner');
    await client.query(migrationSql);
    await client.query('reset role');
  } finally {
    await client.end();
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

describe('Demo bookmark API error matrix', () => {
  let database: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;

  async function http(
    method: string,
    path: string,
    options: {
      token?: string;
      body?: unknown;
      rawBody?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<HttpResult> {
    const headers: Record<string, string> = {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined || options.rawBody !== undefined
        ? { 'content-type': 'application/json' }
        : {}),
      ...options.headers,
    };
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await readBody(response),
    };
  }

  async function createBookmark(input: Partial<{ url: string; title: string; notes: string }> = {}) {
    const response = await http('POST', '/api/demo/bookmark/bookmark', {
      token: WRITE_TOKEN,
      body: {
        url: input.url ?? `https://example.test/${randomUUID()}`,
        title: input.title ?? 'API Matrix',
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    expect(response.status).toBe(201);
    return response.body as { id: string; url: string; title: string | null };
  }

  beforeAll(async () => {
    database = await createPostgresTestDatabase('stynx_demo_bookmark_api_matrix');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: database.connectionString('@stynx/demo-bookmark-api:matrix:owner') },
            app: { connectionString: database.connectionString('@stynx/demo-bookmark-api:matrix:app') },
            reader: { connectionString: database.connectionString('@stynx/demo-bookmark-api:matrix:reader') },
          },
          migrations: { enabled: true },
        }),
      ],
      controllers: [BookmarkController, BookmarkTagController],
      providers: [
        BookmarkService,
        BookmarkTagService,
        StynxAuthGuard,
        PermissionGuard,
        {
          provide: StynxJwtValidator,
          useValue: {
            validate: async (token: string) => ({
              sid: `sid-${token}`,
              sub: ACTOR_ID,
              tenantId: TENANT_ID,
              claims: { scope: 'bookmark-api-matrix' },
            }),
          },
        },
        {
          provide: PermissionCache,
          useValue: {
            getForSession: async (claims: { sid: string }) => {
              const token = claims.sid.replace(/^sid-/u, '');
              return {
                sid: claims.sid,
                userId: ACTOR_ID,
                tenantId: TENANT_ID,
                membershipId: 'membership-api-matrix',
                permissions: tokenPermissions(token),
                hash: tokenPermissions(token).join('|'),
                generation: 1,
                computedAt: Date.now(),
              };
            },
          },
        },
        {
          provide: SessionService,
          useValue: {
            get: async () => ({ status: 'active' }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
    await applyDemoMigration(database);
    await seedBaseState(database);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.dispose();
  });

  describe('GET /api/demo/bookmark/bookmark', () => {
    it('returns 200 with tenant-scoped bookmarks and request-id propagation', async () => {
      const created = await createBookmark({ title: 'List target' });
      const requestId = '0197481e-8000-7000-8000-000000000001';

      const response = await http('GET', '/api/demo/bookmark/bookmark?limit=5', {
        token: READ_TOKEN,
        headers: { 'x-request-id': requestId },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('x-request-id')).toBe(requestId);
      expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
    });

    it('returns 400 when request-id syntax is invalid', async () => {
      const response = await http('GET', '/api/demo/bookmark/bookmark', {
        token: READ_TOKEN,
        headers: { 'x-request-id': 'not-a-uuidv7' },
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ message: 'X-Request-Id must be a valid UUIDv7' });
    });

    it('returns 401 without a bearer token', async () => {
      const response = await http('GET', '/api/demo/bookmark/bookmark');
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ message: 'Missing STYNX bearer token' });
    });

    it('returns 403 when the principal lacks demo:bookmark:read', async () => {
      const response = await http('GET', '/api/demo/bookmark/bookmark', { token: VIEWER_TOKEN });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ message: 'Missing permission demo:bookmark:read' });
    });
  });

  describe('POST /api/demo/bookmark/bookmark', () => {
    it('returns 201 for a valid bookmark create', async () => {
      const response = await http('POST', '/api/demo/bookmark/bookmark', {
        token: WRITE_TOKEN,
        body: { url: `https://example.test/${randomUUID()}`, title: 'Created' },
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ tenantId: TENANT_ID, ownerId: ACTOR_ID, title: 'Created' });
    });

    it('returns 400 for malformed JSON', async () => {
      const response = await http('POST', '/api/demo/bookmark/bookmark', {
        token: WRITE_TOKEN,
        rawBody: '{"url":',
      });

      expect(response.status).toBe(400);
    });

    it('returns 401 without a bearer token', async () => {
      const response = await http('POST', '/api/demo/bookmark/bookmark', {
        body: { url: `https://example.test/${randomUUID()}` },
      });

      expect(response.status).toBe(401);
    });

    it('returns 403 when the principal lacks demo:bookmark:write', async () => {
      const response = await http('POST', '/api/demo/bookmark/bookmark', {
        token: READ_TOKEN,
        body: { url: `https://example.test/${randomUUID()}` },
      });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ message: 'Missing permission demo:bookmark:write' });
    });
  });

  describe('GET /api/demo/bookmark/bookmark/:id', () => {
    it('returns 200 for an existing bookmark', async () => {
      const created = await createBookmark({ title: 'Get target' });

      const response = await http('GET', `/api/demo/bookmark/bookmark/${created.id}`, { token: READ_TOKEN });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: created.id, title: 'Get target' });
    });

    it('returns 401 without a bearer token', async () => {
      const response = await http('GET', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`);
      expect(response.status).toBe(401);
    });

    it('returns 403 when the principal lacks demo:bookmark:read', async () => {
      const response = await http('GET', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`, { token: VIEWER_TOKEN });
      expect(response.status).toBe(403);
    });

    it('returns 404 for an unknown bookmark id', async () => {
      const response = await http('GET', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`, { token: READ_TOKEN });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ message: `BOOKMARK_NOT_FOUND:${UNKNOWN_UUID}` });
    });
  });

  describe('PATCH /api/demo/bookmark/bookmark/:id', () => {
    it('returns 200 for a valid bookmark update', async () => {
      const created = await createBookmark({ title: 'Before patch' });

      const response = await http('PATCH', `/api/demo/bookmark/bookmark/${created.id}`, {
        token: WRITE_TOKEN,
        body: { title: 'After patch' },
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: created.id, title: 'After patch' });
    });

    it('returns 400 for malformed JSON', async () => {
      const response = await http('PATCH', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`, {
        token: WRITE_TOKEN,
        rawBody: '{"title":',
      });

      expect(response.status).toBe(400);
    });

    it('returns 401 without a bearer token', async () => {
      const response = await http('PATCH', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`, {
        body: { title: 'Blocked' },
      });

      expect(response.status).toBe(401);
    });

    it('returns 403 when the principal lacks demo:bookmark:write', async () => {
      const response = await http('PATCH', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`, {
        token: READ_TOKEN,
        body: { title: 'Blocked' },
      });

      expect(response.status).toBe(403);
    });

    it('returns 404 for an unknown bookmark id', async () => {
      const response = await http('PATCH', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`, {
        token: WRITE_TOKEN,
        body: { title: 'Missing' },
      });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ message: `BOOKMARK_NOT_FOUND:${UNKNOWN_UUID}` });
    });
  });

  describe('DELETE /api/demo/bookmark/bookmark/:id', () => {
    it('returns 200 for a valid bookmark delete', async () => {
      const created = await createBookmark({ title: 'Delete target' });

      const response = await http('DELETE', `/api/demo/bookmark/bookmark/${created.id}`, { token: WRITE_TOKEN });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'soft-deleted', id: created.id });
    });

    it('returns 401 without a bearer token', async () => {
      const response = await http('DELETE', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`);
      expect(response.status).toBe(401);
    });

    it('returns 403 when the principal lacks demo:bookmark:write', async () => {
      const response = await http('DELETE', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`, { token: READ_TOKEN });
      expect(response.status).toBe(403);
    });

    it('returns 404 for an unknown bookmark id', async () => {
      const response = await http('DELETE', `/api/demo/bookmark/bookmark/${UNKNOWN_UUID}`, { token: WRITE_TOKEN });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ message: `BOOKMARK_NOT_FOUND:${UNKNOWN_UUID}` });
    });
  });

  describe('GET /api/demo/bookmark/bookmark-tag', () => {
    it('returns 200 with tenant-scoped tags', async () => {
      const created = await createBookmark({ title: 'Tag list parent' });
      await http('POST', '/api/demo/bookmark/bookmark-tag', {
        token: WRITE_TOKEN,
        body: { bookmark_id: created.id, tag: 'matrix' },
      });

      const response = await http('GET', `/api/demo/bookmark/bookmark-tag?bookmark_id=${created.id}`, {
        token: READ_TOKEN,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'matrix' })]));
    });

    it('returns 401 without a bearer token', async () => {
      const response = await http('GET', '/api/demo/bookmark/bookmark-tag');
      expect(response.status).toBe(401);
    });

    it('returns 403 when the principal lacks demo:bookmark:read', async () => {
      const response = await http('GET', '/api/demo/bookmark/bookmark-tag', { token: VIEWER_TOKEN });
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/demo/bookmark/bookmark-tag', () => {
    it('returns 201 for a valid tag create', async () => {
      const created = await createBookmark({ title: 'Tag create parent' });

      const response = await http('POST', '/api/demo/bookmark/bookmark-tag', {
        token: WRITE_TOKEN,
        body: { bookmark_id: created.id, tag: 'created' },
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ bookmarkId: created.id, tag: 'created' });
    });

    it('returns 400 for malformed JSON', async () => {
      const response = await http('POST', '/api/demo/bookmark/bookmark-tag', {
        token: WRITE_TOKEN,
        rawBody: '{"bookmark_id":',
      });

      expect(response.status).toBe(400);
    });

    it('returns 401 without a bearer token', async () => {
      const response = await http('POST', '/api/demo/bookmark/bookmark-tag', {
        body: { bookmark_id: UNKNOWN_UUID, tag: 'blocked' },
      });

      expect(response.status).toBe(401);
    });

    it('returns 403 when the principal lacks demo:bookmark:write', async () => {
      const response = await http('POST', '/api/demo/bookmark/bookmark-tag', {
        token: READ_TOKEN,
        body: { bookmark_id: UNKNOWN_UUID, tag: 'blocked' },
      });

      expect(response.status).toBe(403);
    });

    it('returns 404 for an unknown bookmark id', async () => {
      const response = await http('POST', '/api/demo/bookmark/bookmark-tag', {
        token: WRITE_TOKEN,
        body: { bookmark_id: UNKNOWN_UUID, tag: 'missing-parent' },
      });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ message: `BOOKMARK_NOT_FOUND:${UNKNOWN_UUID}` });
    });
  });

  describe('DELETE /api/demo/bookmark/bookmark-tag/:bookmark_id/:tag', () => {
    it('returns 200 for a valid tag delete', async () => {
      const created = await createBookmark({ title: 'Tag delete parent' });
      await http('POST', '/api/demo/bookmark/bookmark-tag', {
        token: WRITE_TOKEN,
        body: { bookmark_id: created.id, tag: 'delete-me' },
      });

      const response = await http('DELETE', `/api/demo/bookmark/bookmark-tag/${created.id}/delete-me`, {
        token: WRITE_TOKEN,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'deleted', bookmarkId: created.id, tag: 'delete-me' });
    });

    it('returns 401 without a bearer token', async () => {
      const response = await http('DELETE', `/api/demo/bookmark/bookmark-tag/${UNKNOWN_UUID}/missing`);
      expect(response.status).toBe(401);
    });

    it('returns 403 when the principal lacks demo:bookmark:write', async () => {
      const response = await http('DELETE', `/api/demo/bookmark/bookmark-tag/${UNKNOWN_UUID}/missing`, {
        token: READ_TOKEN,
      });
      expect(response.status).toBe(403);
    });

    it('returns 404 for an unknown bookmark id', async () => {
      const response = await http('DELETE', `/api/demo/bookmark/bookmark-tag/${UNKNOWN_UUID}/missing`, {
        token: WRITE_TOKEN,
      });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ message: `BOOKMARK_NOT_FOUND:${UNKNOWN_UUID}` });
    });

    it('returns 404 for an unknown tag on an existing bookmark', async () => {
      const created = await createBookmark({ title: 'Missing tag parent' });

      const response = await http('DELETE', `/api/demo/bookmark/bookmark-tag/${created.id}/missing`, {
        token: WRITE_TOKEN,
      });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ message: `TAG_NOT_FOUND:${created.id}/missing` });
    });
  });
});
