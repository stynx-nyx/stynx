import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ErrorBannerService } from '@stynx-nyx/angular';
import type { ErrorBannerState } from '@stynx-nyx/angular';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';

/** Literal references keep the shipped catalogs in the i18n extraction baseline. */
export const STYNX_ERROR_DEFAULT_KEYS = {
  network: 'ui.error.network',
  validation: 'ui.error.validation',
  authentication: 'ui.error.authentication',
  authorization: 'ui.error.authorization',
  'not-found': 'ui.error.not-found',
  conflict: 'ui.error.conflict',
  precondition: 'ui.error.precondition',
  'rate-limit': 'ui.error.rate-limit',
  server: 'ui.error.server',
  unknown: 'ui.error.unknown',
  dismiss: 'ui.error.dismiss',
} as const;

@Component({
  selector: 'stynx-error-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (banner.current(); as error) {
      <section class="stynx-error-banner" role="alert" [attr.data-tone]="error.tone ?? 'error'">
        <span>{{ displayMessage(error) }}</span>
        @if (error.action && error.actionLabel) {
          <button type="button" (click)="error.action()">{{ error.actionLabel }}</button>
        }
        <button type="button" [attr.aria-label]="dismissLabel()" (click)="banner.clear()">×</button>
      </section>
    }
  `,
  styles: [`
    .stynx-error-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      border: 1px solid var(--mat-sys-error, #dc2626);
      border-radius: 0.5rem;
      background: var(--mat-sys-error-container, #fef2f2);
      color: var(--mat-sys-on-error-container, #7f1d1d);
      padding: 0.75rem 1rem;
    }
    .stynx-error-banner span { flex: 1; }
  `],
})
export class StynxErrorBannerComponent {
  readonly banner = inject(ErrorBannerService);
  private readonly i18n = inject(StynxI18nService, { optional: true });

  dismissLabel(): string {
    const translated = this.i18n?.translate('ui.error.dismiss');
    return translated && translated !== 'ui.error.dismiss' ? translated : 'Dismiss error';
  }

  displayMessage(error: ErrorBannerState): string {
    if (!error.messageKey || !this.i18n) return error.message;
    const translated = this.i18n.translate(error.messageKey, error.messageParams ?? {});
    if (translated === error.messageKey) return error.message;
    const tenantLabel = error.context?.tenantLabel;
    return typeof tenantLabel === 'string' && tenantLabel.length > 0
      ? `[${tenantLabel}] ${translated}`
      : translated;
  }
}
