import { expect, test } from '../fixtures';

test('saves the narrow profile projection through the real W02 route', async ({
  page,
  loginAsAdmin,
}) => {
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

test('saves a complete closed preference document through the real W02 route', async ({
  page,
  loginAsAdmin,
}) => {
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
