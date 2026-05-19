import { Injectable, inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import type { AuthOptions, LoginResponse } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';
import { STYNX_ANGULAR_AUTH_OPTIONS } from './tokens';
import type {
  StynxHostedAuthAction,
  StynxHostedAuthActionContext,
  StynxHostedAuthActionLink,
  StynxHostedAuthActionUrlBuilder,
  StynxOidcAdapter,
} from './types';

function actionOptionName(action: StynxHostedAuthAction): 'changePassword' | 'mfaEnrolment' {
  return action === 'change-password' ? 'changePassword' : 'mfaEnrolment';
}

function encodePlaceholder(value: string | null | undefined): string {
  return value == null ? '' : encodeURIComponent(value);
}

function applyPlaceholders(url: string, context: StynxHostedAuthActionContext): string {
  return url
    .split('{returnUrl}').join(encodePlaceholder(context.returnUrl))
    .split('{state}').join(encodePlaceholder(context.state))
    .split('{tenantId}').join(encodePlaceholder(context.tenantId))
    .split('{locale}').join(encodePlaceholder(context.locale));
}

function browserLocation(): Location | null {
  return typeof globalThis.window === 'object' ? globalThis.window.location : null;
}

function sanitizeCurrentUrl(): string {
  const location = browserLocation();
  if (!location?.href) {
    return '';
  }

  const url = new URL(location.href);
  for (const param of ['code', 'state', 'session_state', 'error', 'error_description', 'error_uri', 'iss']) {
    url.searchParams.delete(param);
  }
  url.hash = '';
  return url.toString();
}

function validateActionUrl(url: string): void {
  const base = browserLocation()?.origin ?? 'https://stynx.local';
  new URL(url, base);
}

@Injectable()
export class OidcClientAdapter implements StynxOidcAdapter {
  private readonly oidcSecurity = inject(OidcSecurityService);
  private readonly options = inject(STYNX_ANGULAR_AUTH_OPTIONS, { optional: true });

  checkAuth(url?: string): Promise<LoginResponse> {
    return firstValueFrom(this.oidcSecurity.checkAuth(url));
  }

  authorize(authOptions?: AuthOptions): void {
    this.oidcSecurity.authorize(undefined, authOptions);
  }

  async logoff(): Promise<void> {
    await firstValueFrom(this.oidcSecurity.logoff());
  }

  forceRefreshSession(): Promise<LoginResponse> {
    return firstValueFrom(this.oidcSecurity.forceRefreshSession());
  }

  getHostedActionLink(
    action: StynxHostedAuthAction,
    context: Partial<StynxHostedAuthActionContext> = {},
  ): StynxHostedAuthActionLink | null {
    const hostedActions = this.options?.hostedActions;
    const configured = hostedActions?.[actionOptionName(action)];
    if (!configured) {
      return null;
    }

    const resolvedContext: StynxHostedAuthActionContext = {
      ...context,
      action,
      returnUrl: context.returnUrl ?? hostedActions?.returnUrl ?? sanitizeCurrentUrl(),
    };
    const resolved = typeof configured === 'function'
      ? (configured as StynxHostedAuthActionUrlBuilder)(resolvedContext)
      : applyPlaceholders(configured, resolvedContext);

    if (!resolved) {
      return null;
    }

    const link = typeof resolved === 'string'
      ? { action, url: resolved, method: 'browser-redirect' as const }
      : resolved;

    validateActionUrl(link.url);
    return {
      ...link,
      action,
      method: 'browser-redirect',
    };
  }

  openHostedAction(
    action: StynxHostedAuthAction,
    context: Partial<StynxHostedAuthActionContext> = {},
  ): void {
    const link = this.getHostedActionLink(action, context);
    const win = typeof globalThis.window === 'object' ? globalThis.window : null;
    if (!link || !win) {
      return;
    }

    if (link.opensIn === 'new-tab') {
      win.open(link.url, '_blank', 'noopener,noreferrer');
      return;
    }

    win.location.assign(link.url);
  }
}
