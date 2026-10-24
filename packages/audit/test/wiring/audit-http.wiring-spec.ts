import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from '../../../core/test/support/request-with-id.js';
import { StynxAuthGuard, PermissionGuard } from '@stynx-nyx/auth';
import { StynxAuditController } from '../../src/audit.controller.js';
import { StynxAuditService } from '../../src/audit.service.js';

describe('StynxAuditController E2E', () => {
  let app: INestApplication;
  const auditService = {
    listLog: vi.fn((): unknown => [{ id: 'audit-1', operation: 'read' }]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StynxAuditController],
      providers: [{ provide: StynxAuditService, useValue: auditService }],
    })
      .overrideGuard(StynxAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves audit log queries through the HTTP route', async () => {
    const response = await request(app.getHttpServer()).get('/_audit/log?limit=1').expect(200);

    expect(response.body).toEqual([{ id: 'audit-1', operation: 'read' }]);
    expect(auditService.listLog).toHaveBeenCalledWith(expect.objectContaining({ limit: '1' }));
  });

  it.each([
    { direct: '2026-10-23T00:00:00.789Z', wire: '2026-10-23T00:00:00.789Z' },
    { direct: 'custom-parser-timestamp', wire: 'custom-parser-timestamp' },
    { direct: Infinity, wire: null },
    { direct: -Infinity, wire: null },
  ])('observes legacy /_audit/log JSON serialization without changing service values: $direct', async ({ direct, wire }) => {
    const page = {
      items: [{ id: Number('9007199254740993'), occurredAt: direct, operation: 'INSERT',
        tags: { opaque: [null, true] }, payload: { nested: { retained: true } } }],
      nextCursor: 'unchanged-encoded-cursor',
    };
    auditService.listLog.mockReturnValueOnce(page);
    const response = await request(app.getHttpServer()).get('/_audit/log?limit=1').expect(200);
    expect(response.body).toEqual({ ...page, items: [{ ...page.items[0], occurredAt: wire }] });
    expect(page.items[0]?.occurredAt).toBe(direct);
    expect(response.headers['content-type']).toContain('application/json');
    expect(auditService.listLog).toHaveBeenLastCalledWith(expect.objectContaining({ limit: '1' }));
  });
});
