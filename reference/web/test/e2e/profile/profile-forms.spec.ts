import type { Page, Route } from '@playwright/test';
import { expect, referenceActors, test } from '../fixtures';

type ProfilePatch = {
  displayName?: string;
  email?: string;
  locale?: string;
  name?: string;
};

type PreferencesPut = {
  locale?: string;
  notifications?: boolean;
};

const initialProfile = {
  name: 'Reference Admin',
  displayName: 'Reference Admin',
  email: referenceActors.admin.email,
  locale: 'en-US',
  preferences: {
    locale: 'en-US',
    notifications: true,
  },
};

async function jsonBody<T>(route: Route): Promise<T> {
  return route.request().postDataJSON() as T;
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installProfileApiMocks(page: Page): Promise<{
  profilePatches: ProfilePatch[];
  preferencePuts: PreferencesPut[];
}> {
  const profilePatches: ProfilePatch[] = [];
  const preferencePuts: PreferencesPut[] = [];

  await page.route('**/profile/preferences', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }

    const preferences = await jsonBody<PreferencesPut>(route);
    preferencePuts.push(preferences);
    await fulfillJson(route, 200, {
      locale: preferences.locale ?? initialProfile.preferences.locale,
      notifications: preferences.notifications ?? initialProfile.preferences.notifications,
    });
  });

  await page.route('**/profile', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }

    const patch = await jsonBody<ProfilePatch>(route);
    profilePatches.push(patch);
    await fulfillJson(route, 200, {
      ...initialProfile,
      ...patch,
      name: patch.name ?? patch.displayName ?? initialProfile.name,
    });
  });

  return { profilePatches, preferencePuts };
}

test('saves profile form changes on the authenticated dashboard', async ({ page, loginAsAdmin }) => {
  const api = await installProfileApiMocks(page);

  await loginAsAdmin();
  await expect(page.getByTestId('profile-form')).toBeVisible();
  await page.getByTestId('profile-name-input').fill('Reference Admin Edited');
  await page.getByTestId('profile-email-input').fill('admin.edited@sample-demo.test');
  await page.getByTestId('profile-locale-input').fill('pt-BR');
  await page.getByTestId('profile-save-submit').click();

  await expect.poll(() => api.profilePatches).toEqual([{
    displayName: 'Reference Admin Edited',
    name: 'Reference Admin Edited',
    email: 'admin.edited@sample-demo.test',
    locale: 'pt-BR',
  }]);
  await expect(page.getByTestId('profile-saved-status')).toBeVisible();
  await expect(page.getByTestId('profile-save-submit')).toBeDisabled();
});

test('surfaces profile save failures without leaving the dashboard', async ({ page, loginAsAdmin }) => {
  let failedRequests = 0;
  await page.route('**/profile', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }

    failedRequests += 1;
    await fulfillJson(route, 500, {
      statusCode: 500,
      message: 'Profile update failed',
      error: 'Internal Server Error',
    });
  });

  await loginAsAdmin();
  await expect(page.getByTestId('profile-form')).toBeVisible();
  await page.getByTestId('profile-name-input').fill('Reference Admin Retry');
  await page.getByTestId('profile-save-submit').click();

  await expect.poll(() => failedRequests).toBe(1);
  await expect(page.getByTestId('profile-error-banner')).toBeVisible();
  await expect(page.getByTestId('profile-saved-status')).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
});

test('saves preference changes on the authenticated dashboard', async ({ page, loginAsAdmin }) => {
  const api = await installProfileApiMocks(page);

  await loginAsAdmin();
  await expect(page.getByTestId('preferences-form')).toBeVisible();
  await page.getByTestId('preferences-locale-input').fill('pt-BR');
  await page.getByTestId('preferences-notifications-checkbox').uncheck();
  await page.getByTestId('preferences-save-submit').click();

  await expect.poll(() => api.preferencePuts).toEqual([{
    locale: 'pt-BR',
    notifications: false,
  }]);
  await expect(page.getByTestId('preferences-saved-status')).toBeVisible();
  await expect(page.getByTestId('preferences-save-submit')).toBeDisabled();
});
