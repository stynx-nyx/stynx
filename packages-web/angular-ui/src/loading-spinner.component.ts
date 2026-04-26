import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'stynx-loading-spinner',
  standalone: true,
  template: `
    <div class="stynx-spinner-shell">
      <div class="stynx-spinner" [style.width.rem]="size" [style.height.rem]="size"></div>
      @if (label) {
        <span>{{ label }}</span>
      }
    </div>
  `,
  styles: [`
    .stynx-spinner-shell {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
    }

    .stynx-spinner {
      border-radius: 999px;
      border: 3px solid color-mix(in srgb, var(--mat-sys-primary, #2563eb) 20%, transparent);
      border-top-color: var(--mat-sys-primary, #2563eb);
      animation: stynx-spin 0.8s linear infinite;
    }

    @keyframes stynx-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxLoadingSpinnerComponent {
  @Input() size = 1.4;
  @Input() label = '';
}
