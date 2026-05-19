import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, startWith } from 'rxjs';
import type { ToastMessage } from './types';

@Injectable()
export class ToastService {
  private readonly queue = signal<ToastMessage[]>([]);
  readonly messages = this.queue.asReadonly();
  /**
   * @deprecated since: 1.x — use toObservable(this.messages) or the signal directly.
   */
  readonly messages$ = toObservable(this.messages).pipe(
    startWith(this.messages()),
    distinctUntilChanged(),
  );

  push(message: Omit<ToastMessage, 'id'>): string {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.queue.update((current) => [...current, { id, ...message }]);
    return id;
  }

  remove(id: string): void {
    this.queue.update((current) => current.filter((item) => item.id !== id));
  }

  clear(): void {
    this.queue.set([]);
  }
}
