import request from 'supertest';
import { I18nAdminService } from '../../src/i18n-admin.service.js';
import { AuthenticatedI18nApp, TENANT_ID } from '../support/authenticated-app.js';

describe('I18nController E2E', () => {
  let fixture: AuthenticatedI18nApp;
  let adminService: I18nAdminService;
  beforeAll(async () => {
    fixture = new AuthenticatedI18nApp();
    await fixture.initialize();
    adminService = fixture.moduleRef.get(I18nAdminService);
    vi.spyOn(adminService, 'listTenantOverrides');
    const admin = await fixture.adminClient();
    try {
      await admin.query(
        'update tenancy.tenant_settings set settings=$2::jsonb where tenant_id=$1',
        [TENANT_ID, JSON.stringify({ 'i18n.override.pt-BR.hello': 'Ola' })],
      );
    } finally {
      await admin.end();
    }
  }, 60000);
  afterAll(async () => {
    await fixture?.teardown();
  });

  it('routes tenant override reads through the HTTP controller', async () => {
    const response = await request(fixture.app.getHttpServer())
      .get('/_tenancy/i18n/overrides')
      .set('x-tenant-id', TENANT_ID)
      .set('authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    expect(response.body).toEqual({ 'i18n.override.pt-BR.hello': 'Ola' });
    expect(adminService.listTenantOverrides).toHaveBeenCalledWith(TENANT_ID);
  });
});
