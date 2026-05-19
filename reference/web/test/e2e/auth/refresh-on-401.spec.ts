import { expect, test } from '../fixtures';
import { openRecords } from '../shared/nav';

test('refreshes and retries a records request after one 401', async ({ page, loginAsAdmin }) => {
  let recordsRequests = 0;
  let replaySawRetryHeader = false;

  await page.route('**/records', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    recordsRequests += 1;
    if (recordsRequests === 1) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 401,
          message: 'Expired STYNX bearer token',
          error: 'Unauthorized',
        }),
      });
      return;
    }

    replaySawRetryHeader = route.request().headers()['x-stynx-auth-retried'] === 'true';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await loginAsAdmin();
  await openRecords(page);

  await expect.poll(() => recordsRequests).toBe(2);
  expect(replaySawRetryHeader).toBe(true);
});
