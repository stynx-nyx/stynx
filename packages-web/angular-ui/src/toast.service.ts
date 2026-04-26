import { Injectable, computed, signal } from '@angular/core';

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

  push(
    message: string,
    tone: StynxToast['tone'] = 'info',
  ): StynxToast {
    const toast: StynxToast = {
      id: this.nextId++,
      message,
      tone,
    };
    this.toastsState.update((current) => [...current, toast]);
    return toast;
  }

  dismiss(id: number): void {
    this.toastsState.update((current) => current.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.toastsState.set([]);
  }
}
