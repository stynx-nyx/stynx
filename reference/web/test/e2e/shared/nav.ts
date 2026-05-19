import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function expectAuthenticatedShell(page: Page): Promise<void> {
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
  await expect(page.getByTestId('nav-records')).toBeVisible();
  await expect(page.getByTestId('nav-work-items')).toBeVisible();
  await expect(page.getByTestId('nav-trash')).toBeVisible();
  await expect(page.getByTestId('logout-button')).toBeEnabled();
}

export async function openRecords(page: Page): Promise<void> {
  await page.getByTestId('nav-records').click();
  await expect(page.getByTestId('records-title')).toBeVisible();
}
