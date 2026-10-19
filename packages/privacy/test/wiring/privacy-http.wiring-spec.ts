import request from 'supertest';
import { AuthenticatedPrivacyApp } from '../support/authenticated-privacy-app.js';

describe('PrivacyController E2E', () => {
  let fixture: AuthenticatedPrivacyApp;
  beforeAll(async () => {
    fixture = new AuthenticatedPrivacyApp();
    await fixture.initialize();
  }, 60_000);
  afterAll(async () => {
    await fixture?.teardown();
  });

  it('serves retention dry-run requests through HTTP', async () => {
    // Observer calls the actual owned service, canonical guards and live SQL.
    const applyRetention = vi.spyOn(fixture.privacy, 'applyTenantRetention');
    const response = await request(fixture.app.getHttpServer())
      .get('/privacy/retention')
      .set(fixture.headers('reader'))
      .expect(200);
    expect(response.body).toEqual({
      dryRun: true,
      actions: [
        {
          table: 'privacy_http.attachments',
          target: 'live',
          strategy: 'delete_row',
          affectedRows: 1,
          reason: 'retention>30d',
        },
        {
          table: 'archive.privacy_http_attachments',
          target: 'archive',
          strategy: 'delete_row',
          affectedRows: 1,
          reason: 'retention>30d',
        },
      ],
      partitions: [],
    });
    expect(applyRetention).toHaveBeenCalledWith(true);
    expect(fixture.observations.some((row) => row.requestedRole === 'owner')).toBe(false);
    const business = fixture.queries.filter(
      (row) => row.sql.includes('core.pii_map') || row.sql.includes('privacy_http'),
    );
    expect(business.length).toBeGreaterThan(0);
    expect(
      business.every(
        (row) =>
          row.current_user === 'stynx_reader' &&
          row.session_user === 'stynx_reader' &&
          row.readonly === 'on',
      ),
    ).toBe(true);
  });
});
