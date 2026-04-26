import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'stynx-empty-state',
  standalone: true,
  template: `
    <section class="stynx-empty-state" [attr.data-tone]="tone">
      <h3>{{ title }}</h3>
      <p>{{ description }}</p>
    </section>
  `,
  styles: [`
    .stynx-empty-state {
      border: 1px dashed currentColor;
      border-radius: 12px;
      padding: 1rem;
      text-align: center;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';
  @Input() tone: 'info' | 'warning' | 'error' = 'info';
}
