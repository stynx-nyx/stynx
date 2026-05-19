import { Injectable, NgZone, inject } from '@angular/core';
import type { CanDeactivate, CanDeactivateFn } from '@angular/router';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import type { Observable } from 'rxjs';

export interface StynxUnsavedChangesAware {
  hasUnsavedChanges(): boolean;
  confirmDiscardChanges?(): boolean | Promise<boolean> | Observable<boolean>;
}

@Injectable({ providedIn: 'root' })
export class UnsavedChangesRegistry {
  private readonly zone = inject(NgZone);
  private readonly entries = new Set<StynxUnsavedChangesAware>();
  private listening = false;

  register(entry: StynxUnsavedChangesAware): () => void {
    this.entries.add(entry);
    this.ensureBeforeUnloadListener();
    return () => {
      this.entries.delete(entry);
    };
  }

  hasUnsavedChanges(): boolean {
    for (const entry of this.entries) {
      if (entry.hasUnsavedChanges()) {
        return true;
      }
    }
    return false;
  }

  private ensureBeforeUnloadListener(): void {
    if (this.listening || typeof globalThis.window !== 'object') {
      return;
    }

    this.listening = true;
    this.zone.runOutsideAngular(() => {
      globalThis.window.addEventListener('beforeunload', this.onBeforeUnload);
    });
  }

  private readonly onBeforeUnload = (event: BeforeUnloadEvent): string | undefined => {
    if (!this.hasUnsavedChanges()) {
      return undefined;
    }

    event.preventDefault();
    event.returnValue = '';
    return '';
  };
}

@Injectable({ providedIn: 'root' })
export class UnsavedChangesGuard implements CanDeactivate<StynxUnsavedChangesAware> {
  private readonly i18n = inject(StynxI18nService, { optional: true });

  canDeactivate(component: StynxUnsavedChangesAware): boolean | Promise<boolean> | Observable<boolean> {
    if (!component.hasUnsavedChanges()) {
      return true;
    }

    if (component.confirmDiscardChanges) {
      return component.confirmDiscardChanges();
    }

    const message = this.i18n?.translate('profile.unsaved.confirm') ?? 'profile.unsaved.confirm';
    return typeof globalThis.window === 'object' ? globalThis.window.confirm(message) : true;
  }
}

export const unsavedChangesGuard: CanDeactivateFn<StynxUnsavedChangesAware> = (component) => {
  return inject(UnsavedChangesGuard).canDeactivate(component);
};
