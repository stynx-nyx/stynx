import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StynxToastService } from './toast.service';

@Component({
  selector: 'stynx-toast-container',
  standalone: true,
  template: `
    <aside class="stynx-toast-stack">
      @for (toast of service.toasts(); track toast.id) {
        <button
          class="stynx-toast"
          type="button"
          [attr.data-tone]="toast.tone"
          (click)="service.dismiss(toast.id)"
        >
          {{ toast.message }}
        </button>
      }
    </aside>
  `,
  styles: [`
    .stynx-toast-stack {
      position: fixed;
      top: 1rem;
      right: 1rem;
      display: grid;
      gap: 0.75rem;
      z-index: 1000;
    }

    .stynx-toast {
      min-width: 16rem;
      text-align: left;
      border: 0;
      border-radius: 14px;
      padding: 0.85rem 1rem;
      background: var(--mat-sys-surface-container-high, #e2e8f0);
      color: var(--mat-sys-on-surface, #0f172a);
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
    }

    .stynx-toast[data-tone='success'] {
      background: color-mix(in srgb, var(--mat-sys-primary, #16a34a) 18%, white);
    }

    .stynx-toast[data-tone='warning'] {
      background: color-mix(in srgb, var(--mat-sys-tertiary, #f59e0b) 18%, white);
    }

    .stynx-toast[data-tone='error'] {
      background: color-mix(in srgb, var(--mat-sys-error, #dc2626) 16%, white);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxToastContainerComponent {
  protected readonly service = inject(StynxToastService);
}
