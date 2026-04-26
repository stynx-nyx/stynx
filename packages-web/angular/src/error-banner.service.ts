import { Injectable, computed, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { ErrorBannerState } from './types';

@Injectable()
export class ErrorBannerService {
  private readonly state = signal<ErrorBannerState | null>(null);
  private readonly state$ = new BehaviorSubject<ErrorBannerState | null>(null);
  readonly current = computed(() => this.state());
  readonly current$ = this.state$.asObservable();

  show(error: ErrorBannerState): void {
    this.state.set(error);
    this.state$.next(error);
  }

  clear(): void {
    this.state.set(null);
    this.state$.next(null);
  }
}
