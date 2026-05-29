import { expect, test } from '../fixtures';
import { expectAuthenticatedShell } from '../shared/nav';

test('renders the authenticated reference shell within the smoke budget', async ({
  page,
  loginAsAdmin,
}) => {
  await loginAsAdmin();
  await expectAuthenticatedShell(page);

  const navigationDurationMs = await page.evaluate(() => {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return entry?.duration ?? 0;
  });

  expect(navigationDurationMs).toBeLessThan(10_000);
});
