import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { referenceActors, referenceTenants } from './reference-data';
import type { ReferenceActor } from './reference-data';

type SpaAuthMocksOptions = {
  actor?: ReferenceActor;
  failLogin?: boolean;
  onDevLogin?: () => void;
  onLogout?: () => void;
};

type CapturedPageError = {
  message: string;
  stack?: string;
};

function capturePageErrors(page: Page): CapturedPageError[] {
  const pageErrors: CapturedPageError[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack,
    });
  });
  return pageErrors;
}

function assertNoPageErrors(pageErrors: CapturedPageError[], context: string): void {
  if (pageErrors.length === 0) {
    return;
  }

  const details = pageErrors
    .map((error) => error.stack ?? error.message)
    .join('\n\n');
  throw new Error(`${context} failed because the SPA emitted a browser page error:\n${details}`);
}

function encodeJwtPart(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createAccessToken(actor: ReferenceActor, tenantId: string): string {
  return [
    encodeJwtPart({ alg: 'none', typ: 'JWT' }),
    encodeJwtPart({
      sub: actor.email,
      email: actor.email,
      tenant_id: tenantId,
      permissions: actor.permissions,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    'signature',
  ].join('.');
}

async function requestBody(route: Route): Promise<{ email?: string; tenantId?: string }> {
  try {
    return route.request().postDataJSON() as { email?: string; tenantId?: string };
  } catch {
    return {};
  }
}

export async function installSpaAuthMocks(page: Page, options: SpaAuthMocksOptions = {}): Promise<void> {
  await page.route('**/_reference/dev-login', async (route) => {
    options.onDevLogin?.();
    if (options.failLogin) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 401,
          message: 'Email is required',
          error: 'Unauthorized',
        }),
      });
      return;
    }

    const body = await requestBody(route);
    const actor = options.actor ?? referenceActors.admin;
    const tenantId = body.tenantId ?? referenceTenants.sampleDemo.id;
    const accessToken = createAccessToken(actor, tenantId);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        sid: `sid-${actor.email}`,
        accessToken,
        accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        refreshToken: `refresh-${actor.email}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        idleExpiresAt: new Date(Date.now() + 1800_000).toISOString(),
        tenantId,
        email: actor.email,
        permissions: actor.permissions,
      }),
    });
  });

  await page.route('**/sessions/logout', async (route) => {
    options.onLogout?.();
    await route.fulfill({
      status: 204,
      body: '',
    });
  });
}

export async function gotoLoginPage(page: Page): Promise<CapturedPageError[]> {
  const pageErrors = capturePageErrors(page);
  await page.goto('/login');
  assertNoPageErrors(pageErrors, 'Opening /login');
  await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 10_000 });
  assertNoPageErrors(pageErrors, 'Rendering /login');
  return pageErrors;
}

export async function loginAs(
  page: Page,
  actor: ReferenceActor = referenceActors.admin,
  tenantId = referenceTenants.sampleDemo.id,
): Promise<void> {
  const pageErrors = await gotoLoginPage(page);
  await page.getByTestId('login-email').fill(actor.email);
  await page.getByTestId('login-tenant').selectOption(tenantId);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
  assertNoPageErrors(pageErrors, 'Completing dev auth login');
}
