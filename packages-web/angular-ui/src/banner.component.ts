import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'stynx-banner',
  standalone: true,
  template: `
    <section class="stynx-banner" [attr.data-tone]="tone">
      @if (title) {
        <strong>{{ title }}</strong>
      }
      <span>{{ message }}</span>
    </section>
  `,
  styles: [`
    .stynx-banner {
      display: grid;
      gap: 0.25rem;
      border-radius: 14px;
      padding: 0.9rem 1rem;
      border: 1px solid color-mix(in srgb, var(--mat-sys-outline, #94a3b8) 50%, transparent);
      background: var(--mat-sys-surface-container-low, #f8fafc);
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .stynx-banner[data-tone='warning'] {
      background: color-mix(in srgb, var(--mat-sys-tertiary, #f59e0b) 12%, white);
    }

    .stynx-banner[data-tone='error'] {
      background: color-mix(in srgb, var(--mat-sys-error, #dc2626) 10%, white);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxBannerComponent {
  @Input() title = '';
  @Input({ required: true }) message = '';
  @Input() tone: 'info' | 'warning' | 'error' | 'success' = 'info';
}
