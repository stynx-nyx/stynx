import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { StynxIconComponent } from './icon/icon.component';
import type { StynxIconName } from './icon/icon.component';

@Component({
  selector: 'stynx-banner',
  standalone: true,
  imports: [StynxIconComponent],
  template: `
    <section class="stynx-banner" [attr.data-tone]="tone">
      <stynx-icon [name]="toneIcon" aria-hidden="true"></stynx-icon>
      <span class="stynx-banner-content">
        @if (title) {
          <strong>{{ title }}</strong>
        }
        <span>{{ message }}</span>
      </span>
    </section>
  `,
  styles: [`
    .stynx-banner {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      gap: 0.25rem;
      border-radius: 14px;
      padding: 0.9rem 1rem;
      border: 1px solid color-mix(in srgb, var(--mat-sys-outline, #94a3b8) 50%, transparent);
      background: var(--mat-sys-surface-container-low, #f8fafc);
      color: var(--mat-sys-on-surface, #0f172a);
    }

    stynx-icon {
      --stynx-icon-size: 1.15rem;
      margin-top: 0.1rem;
    }

    .stynx-banner-content {
      display: grid;
      gap: 0.25rem;
      min-width: 0;
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

  get toneIcon(): StynxIconName {
    switch (this.tone) {
      case 'success':
        return 'check';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  }
}
