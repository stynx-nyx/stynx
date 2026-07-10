import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TenantContextService } from '@stynx-nyx/angular-tenancy';
import { distinctUntilChanged, startWith } from 'rxjs';
import type { ErrorBannerState } from './types';

@Injectable()
export class ErrorBannerService {
  private readonly tenantContext = inject(TenantContextService, { optional: true });
  private readonly state = signal<ErrorBannerState | null>(null);
  readonly current = computed(() => this.state());
  /**
   * @deprecated since: 1.x — use toObservable(this.current) or the signal directly.
   */
  readonly current$ = toObservable(this.current).pipe(
    startWith(this.current()),
    distinctUntilChanged(),
  );

  show(error: ErrorBannerState): void {
    this.state.set(this.decorateWithTenantLabel(error));
  }

  clear(): void {
    this.state.set(null);
  }

  private decorateWithTenantLabel(error: ErrorBannerState): ErrorBannerState {
    const tenantLabel = this.tenantContext?.tenantLabel();
    if (!tenantLabel) {
      return error;
    }

    return {
      ...error,
      message: `[${tenantLabel}] ${error.message}`,
      context: {
        ...error.context,
        tenantLabel,
      },
    };
  }
}
