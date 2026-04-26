import { Injectable, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { ToastMessage } from './types';

@Injectable()
export class ToastService {
  private readonly queue = signal<ToastMessage[]>([]);
  private readonly queue$ = new BehaviorSubject<ToastMessage[]>([]);
  readonly messages = this.queue.asReadonly();
  readonly messages$ = this.queue$.asObservable();

  push(message: Omit<ToastMessage, 'id'>): string {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.queue.update((current) => {
      const next = [...current, { id, ...message }];
      this.queue$.next(next);
      return next;
    });
    return id;
  }

  remove(id: string): void {
    this.queue.update((current) => {
      const next = current.filter((item) => item.id !== id);
      this.queue$.next(next);
      return next;
    });
  }

  clear(): void {
    this.queue.set([]);
    this.queue$.next([]);
  }
}
