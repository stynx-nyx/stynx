import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Client } from 'pg';
import { StynxDataModule } from '@stynx-nyx/data';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { StynxAuditModule } from '../../src/audit.module';

async function seedAuditLogRow(client: Client): Promise<void> {
  await client.query(
    `
      insert into audit.log (
        table_schema,
        table_name,
        row_id,
        operation,
        request_id,
        tags,
        payload
      )
      values (
        'demo',
        'items',
        'row-1',
        'READ',
        'req-api-matrix',
        '{"api_matrix": true}'::jsonb,
        '{"source": "audit-api-matrix"}'::jsonb
      )
    `,
  );
}

describe('StynxAuditController API error matrix', () => {
  let app: INestApplication;
  let database: PostgresTestDatabase;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    database = await createPostgresTestDatabase('stynx_audit_api_matrix');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: database.connectionString('@stynx-nyx/audit:api-matrix:owner') },
            app: { connectionString: database.connectionString('@stynx-nyx/audit:api-matrix:app') },
            reader: { connectionString: database.connectionString('@stynx-nyx/audit:api-matrix:reader') },
          },
          migrations: { enabled: true },
        }),
        StynxAuditModule.forRoot(),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const admin = await database.connectAsAdmin();
    try {
      await seedAuditLogRow(admin);
    } finally {
      await admin.end();
    }
  });

  afterAll(async () => {
    await app?.close();
    await database?.dispose();
  });

  describe('GET /_audit/log', () => {
    it('returns 200 with audit log entries for an authorized audit reader', async () => {
      const response = await request(app.getHttpServer())
        .get('/_audit/log?limit=1')
        .set('Authorization', 'Bearer audit-reader')
        .expect(200);

      expect(response.body).toMatchObject({
        items: [
          {
            tableSchema: 'demo',
            tableName: 'items',
            rowId: 'row-1',
            operation: 'READ',
            requestId: 'req-api-matrix',
            tags: { api_matrix: true },
            payload: { source: 'audit-api-matrix' },
          },
        ],
      });
      expect(response.body.items[0].id).toEqual(expect.any(Number));
      expect(response.body.items[0].occurredAt).toEqual(expect.any(String));
    });

    it('returns 401 when the bearer token is missing', async () => {
      const response = await request(app.getHttpServer()).get('/_audit/log?limit=1').expect(401);

      expect(response.body).toMatchObject({
        message: 'Missing STYNX bearer token',
      });
    });

    it('returns 403 when the principal lacks platform:audit:read:*', async () => {
      const response = await request(app.getHttpServer())
        .get('/_audit/log?limit=1')
        .set('Authorization', 'Bearer viewer')
        .expect(403);

      expect(response.body).toMatchObject({
        message: 'Missing permission platform:audit:read:*',
      });
    });
  });
});
