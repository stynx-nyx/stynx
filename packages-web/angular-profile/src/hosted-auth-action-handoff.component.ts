import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { ErrorBannerService } from '@stynx-nyx/angular';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { STYNX_OIDC_ADAPTER, type StynxHostedAuthAction, type StynxHostedAuthActionContext } from '@stynx-nyx/angular-auth';
import { StynxBannerComponent, StynxIconComponent } from '@stynx-nyx/angular-ui';

type HostedActionStatus = 'ready' | 'unavailable' | 'error';

const ACTION_LABEL_KEYS: Record<StynxHostedAuthAction, string> = {
  'change-password': 'profile.security.changePassword.action',
  'mfa-enrolment': 'profile.security.mfaEnrolment.action',
};

const ACTION_UNAVAILABLE_KEYS: Record<StynxHostedAuthAction, string> = {
  'change-password': 'profile.security.changePassword.unavailable',
  'mfa-enrolment': 'profile.security.mfaEnrolment.unavailable',
};

const ACTION_ERROR_KEYS: Record<StynxHostedAuthAction, string> = {
  'change-password': 'profile.security.changePassword.error',
  'mfa-enrolment': 'profile.security.mfaEnrolment.error',
};

function currentReturnUrl(): string {
  return typeof globalThis.window === 'object' ? globalThis.window.location.href : '';
}

class HostedAuthActionHandoffController {
  private readonly adapter = inject(STYNX_OIDC_ADAPTER, { optional: true });
  private readonly errorBanner = inject(ErrorBannerService, { optional: true });
  private readonly i18n = inject(StynxI18nService, { optional: true });

  readonly status = signal<HostedActionStatus>('unavailable');
  readonly message = signal('');

  returnUrl = '';
  state = '';
  tenantId: string | null = null;
  locale: string | null = null;

  constructor(private readonly action: StynxHostedAuthAction) {
    this.refresh();
  }

  get labelKey(): string {
    return ACTION_LABEL_KEYS[this.action];
  }

  refresh(): void {
    try {
      const link = this.adapter?.getHostedActionLink?.(this.action, this.context());
      this.status.set(link ? 'ready' : 'unavailable');
      this.message.set(link ? '' : this.translate(ACTION_UNAVAILABLE_KEYS[this.action]));
    } catch {
      this.markConfigError();
    }
  }

  open(): void {
    try {
      const context = this.context();
      const link = this.adapter?.getHostedActionLink?.(this.action, context);
      if (!link) {
        this.status.set('unavailable');
        this.message.set(this.translate(ACTION_UNAVAILABLE_KEYS[this.action]));
        return;
      }

      this.status.set('ready');
      this.message.set('');
      if (this.adapter?.openHostedAction) {
        this.adapter.openHostedAction(this.action, context);
        return;
      }

      if (typeof globalThis.window === 'object') {
        globalThis.window.location.assign(link.url);
      }
    } catch {
      this.markConfigError();
    }
  }

  private context(): Partial<StynxHostedAuthActionContext> {
    const context: Partial<StynxHostedAuthActionContext> = {
      returnUrl: this.returnUrl || currentReturnUrl(),
      tenantId: this.tenantId,
      locale: this.locale,
    };
    if (this.state) {
      context.state = this.state;
    }
    return context;
  }

  private markConfigError(): void {
    const message = this.translate(ACTION_ERROR_KEYS[this.action]);
    this.status.set('error');
    this.message.set(message);
    this.errorBanner?.show({
      message,
      tone: 'error',
      code: 'AUTH:CONFIG:hosted-action-url',
      context: { action: this.action },
    });
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}

@Component({
  selector: 'stynx-change-password-handoff',
  standalone: true,
  imports: [StynxBannerComponent, StynxIconComponent, StynxTranslatePipe],
  template: `
    <section class="stynx-hosted-action" data-testid="change-password-handoff" [attr.data-status]="handoff.status()">
      @if (handoff.message()) {
        <stynx-banner
          data-testid="change-password-handoff-message"
          [tone]="handoff.status() === 'error' ? 'error' : 'warning'"
          [message]="handoff.message()"
        ></stynx-banner>
      }
      <button
        type="button"
        data-testid="change-password-handoff-button"
        [disabled]="handoff.status() !== 'ready'"
        (click)="handoff.open()"
      >
        <stynx-icon name="external-link" aria-hidden="true"></stynx-icon>
        {{ handoff.labelKey | stynxTranslate }}
      </button>
    </section>
  `,
  styles: [`
    .stynx-hosted-action {
      display: grid;
      gap: 0.75rem;
      justify-items: start;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      border: 1px solid var(--mat-sys-primary, #2563eb);
      border-radius: 8px;
      padding: 0.65rem 0.9rem;
      background: var(--mat-sys-primary, #2563eb);
      color: var(--mat-sys-on-primary, #ffffff);
      font: inherit;
      font-weight: 700;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    stynx-icon {
      --stynx-icon-size: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxChangePasswordHandoffComponent {
  readonly handoff = new HostedAuthActionHandoffController('change-password');

  @Input()
  set returnUrl(value: string) {
    this.handoff.returnUrl = value;
    this.handoff.refresh();
  }

  @Input()
  set state(value: string) {
    this.handoff.state = value;
    this.handoff.refresh();
  }

  @Input()
  set tenantId(value: string | null) {
    this.handoff.tenantId = value;
    this.handoff.refresh();
  }

  @Input()
  set locale(value: string | null) {
    this.handoff.locale = value;
    this.handoff.refresh();
  }
}

@Component({
  selector: 'stynx-mfa-enrolment-handoff',
  standalone: true,
  imports: [StynxBannerComponent, StynxIconComponent, StynxTranslatePipe],
  template: `
    <section class="stynx-hosted-action" data-testid="mfa-enrolment-handoff" [attr.data-status]="handoff.status()">
      @if (handoff.message()) {
        <stynx-banner
          data-testid="mfa-enrolment-handoff-message"
          [tone]="handoff.status() === 'error' ? 'error' : 'warning'"
          [message]="handoff.message()"
        ></stynx-banner>
      }
      <button
        type="button"
        data-testid="mfa-enrolment-handoff-button"
        [disabled]="handoff.status() !== 'ready'"
        (click)="handoff.open()"
      >
        <stynx-icon name="external-link" aria-hidden="true"></stynx-icon>
        {{ handoff.labelKey | stynxTranslate }}
      </button>
    </section>
  `,
  styles: [`
    .stynx-hosted-action {
      display: grid;
      gap: 0.75rem;
      justify-items: start;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      border: 1px solid var(--mat-sys-primary, #2563eb);
      border-radius: 8px;
      padding: 0.65rem 0.9rem;
      background: var(--mat-sys-primary, #2563eb);
      color: var(--mat-sys-on-primary, #ffffff);
      font: inherit;
      font-weight: 700;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    stynx-icon {
      --stynx-icon-size: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxMfaEnrolmentHandoffComponent {
  readonly handoff = new HostedAuthActionHandoffController('mfa-enrolment');

  @Input()
  set returnUrl(value: string) {
    this.handoff.returnUrl = value;
    this.handoff.refresh();
  }

  @Input()
  set state(value: string) {
    this.handoff.state = value;
    this.handoff.refresh();
  }

  @Input()
  set tenantId(value: string | null) {
    this.handoff.tenantId = value;
    this.handoff.refresh();
  }

  @Input()
  set locale(value: string | null) {
    this.handoff.locale = value;
    this.handoff.refresh();
  }
}
