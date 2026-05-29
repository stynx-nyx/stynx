import { expect, test } from '../fixtures';

function currencySample(locale: string): string {
  return new Intl.NumberFormat(locale, {
    currency: 'USD',
    style: 'currency',
  }).format(1234.56);
}

test('switches dashboard locale strings and currency formatting', async ({
  page,
  loginAsAdmin,
}) => {
  await loginAsAdmin();

  await expect(page.getByTestId('app-title')).toHaveText('Reference workflow cockpit');
  await expect(page.getByTestId('dashboard-title')).toHaveText('Operational overview');
  await expect(page.getByTestId('i18n-number-sample')).toHaveText(currencySample('en-US'));

  await page.getByTestId('locale-switcher-select').selectOption('pt-BR');
  await expect(page.getByTestId('locale-switcher-select')).toHaveValue('pt-BR');

  await expect
    .poll(async () => page.getByTestId('app-title').textContent())
    .toBe('Cockpit do fluxo de referencia');
  await expect
    .poll(async () => page.getByTestId('dashboard-title').textContent())
    .toBe('Visao operacional');
  await expect
    .poll(async () => page.getByTestId('i18n-number-sample').textContent())
    .toBe(currencySample('pt-BR'));

  await page.getByTestId('locale-switcher-select').selectOption('en-US');
  await expect(page.getByTestId('locale-switcher-select')).toHaveValue('en-US');

  await expect
    .poll(async () => page.getByTestId('app-title').textContent())
    .toBe('Reference workflow cockpit');
  await expect
    .poll(async () => page.getByTestId('dashboard-title').textContent())
    .toBe('Operational overview');
  await expect
    .poll(async () => page.getByTestId('i18n-number-sample').textContent())
    .toBe(currencySample('en-US'));
});
