import { Injectable, computed, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, startWith } from 'rxjs';

export interface StynxToast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

@Injectable({ providedIn: 'root' })
export class StynxToastService {
  private nextId = 1;
  private readonly toastsState = signal<StynxToast[]>([]);
  readonly toasts = computed(() => this.toastsState());
  /**
   * @deprecated since: 1.x — use toObservable(this.toasts) or the signal directly.
   */
  readonly toasts$ = toObservable(this.toasts).pipe(
    startWith(this.toasts()),
    distinctUntilChanged(),
  );

  push(
    message: string,
    tone: StynxToast['tone'] = 'info',
    ttlMs = 5000,
  ): StynxToast {
    const toast: StynxToast = {
      id: this.nextId++,
      message,
      tone,
    };
    this.toastsState.update((current) => [...current, toast]);
    if (ttlMs > 0) {
      globalThis.setTimeout(() => this.dismiss(toast.id), ttlMs);
    }
    return toast;
  }

  dismiss(id: number): void {
    this.toastsState.update((current) => current.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.toastsState.set([]);
  }
}
