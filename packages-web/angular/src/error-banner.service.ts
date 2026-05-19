import { Injectable, computed, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, startWith } from 'rxjs';
import type { ErrorBannerState } from './types';

@Injectable()
export class ErrorBannerService {
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
    this.state.set(error);
  }

  clear(): void {
    this.state.set(null);
  }
}
