import { expect, test } from '../fixtures';

test('saves the narrow profile projection through the W02 route contract', async ({
  page,
  loginAsAdmin,
}) => {
  await page.route('**/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ETag: '"1"' },
      body: JSON.stringify({
        subjectId: 'admin@sample-demo.test',
        displayName: 'Reference Admin Edited',
        avatarDocumentId: null,
        avatarUrl: null,
        preferences: {
          values: {
            locale: { locale: 'en-US', timezone: 'UTC' },
            theme: { colorScheme: 'system', contrast: 'standard', density: 'comfortable' },
            accessibility: { reduceMotion: false, largeText: false, screenReaderOptimized: false },
            notificationDelivery: { email: true, push: true, inApp: true },
          },
          revision: 1,
          updatedAt: null,
        },
        revision: 1,
        updatedAt: null,
      }),
    });
  });
  await loginAsAdmin();
  await expect(page.getByTestId('profile-form')).toBeVisible();

  const requestPromise = page.waitForRequest(
    (request) => request.url().endsWith('/profile') && request.method() === 'PATCH',
  );
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/profile') && response.request().method() === 'PATCH',
  );
  await page.getByTestId('profile-name-input').fill('Reference Admin Edited');
  await page.getByTestId('profile-save-submit').click();

  const request = await requestPromise;
  expect(request.postDataJSON()).toEqual({ displayName: 'Reference Admin Edited' });
  expect(request.headers()['if-match']).toMatch(/^"\d+"$/);
  expect((await responsePromise).status()).toBe(200);
  await expect(page.getByTestId('profile-saved-status')).toBeVisible();
  await expect(page.getByTestId('profile-save-submit')).toBeDisabled();
});

test('saves a complete closed preference document through the W02 route contract', async ({
  page,
  loginAsAdmin,
}) => {
  await page.route('**/profile/preferences', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ETag: '"1"' },
      body: JSON.stringify({
        values: route.request().postDataJSON(),
        revision: 1,
        updatedAt: null,
      }),
    });
  });
  await loginAsAdmin();
  await expect(page.getByTestId('preferences-form')).toBeVisible();

  const requestPromise = page.waitForRequest(
    (request) => request.url().endsWith('/profile/preferences') && request.method() === 'PUT',
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/profile/preferences') && response.request().method() === 'PUT',
  );
  await page.getByTestId('preferences-locale-input').fill('pt-BR');
  await page.getByTestId('preferences-notifications-checkbox').uncheck();
  await page.getByTestId('preferences-save-submit').click();

  const request = await requestPromise;
  expect(request.postDataJSON()).toEqual({
    locale: { locale: 'pt-BR', timezone: 'UTC' },
    theme: { colorScheme: 'system', contrast: 'standard', density: 'comfortable' },
    accessibility: { reduceMotion: false, largeText: false, screenReaderOptimized: false },
    notificationDelivery: { email: false, push: false, inApp: false },
  });
  expect(request.headers()['if-match']).toMatch(/^"\d+"$/);
  expect((await responsePromise).status()).toBe(200);
  await expect(page.getByTestId('preferences-saved-status')).toBeVisible();
  await expect(page.getByTestId('preferences-save-submit')).toBeDisabled();
});
