import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../fixtures';

test('shell supports keyboard navigation, persisted theme preferences, and axe checks', async ({ page }) => {
  await page.goto('/shell');

  const skip = page.getByRole('link', { name: 'Skip to content' });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Home' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Settings' })).toBeFocused();
  const collapse = page.locator('stynx-shell button.menu-toggle');
  await page.keyboard.press('Tab');
  await expect(collapse).toBeFocused();
  await expect(collapse).toHaveAccessibleName('Collapse navigation menu');
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await collapse.click();
  await expect(collapse).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand navigation menu' }).click();

  const main = page.getByRole('main');
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(main).toBeFocused();

  const themeToggle = page.getByRole('button', { name: 'Theme' });
  await page.getByRole('button', { name: 'Collapse navigation menu' }).focus();
  await page.keyboard.press('Tab');
  await expect(themeToggle).toBeFocused();
  await themeToggle.click();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-stynx-theme', 'dark');

  await page.getByTestId('locale-switcher-select').selectOption('pt-BR');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tema' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-stynx-theme', 'dark');

  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'))
    .toEqual([]);
});

test('shell handles invalid and unavailable theme storage without a scan or page failure', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('stynx.shell.theme', 'sepia'));
  await page.goto('/shell');
  await expect(page.locator('html')).not.toHaveAttribute('data-stynx-theme', 'system');

  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage denied'); },
    });
  });
  await page.reload();
  await expect(page.getByRole('main')).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'))
    .toEqual([]);
});
