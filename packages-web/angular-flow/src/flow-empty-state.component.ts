import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { StynxHasPermissionDirective } from '@stynx-web/angular-auth';
import { StynxIconComponent } from '@stynx-web/angular-ui';

@Component({
  selector: 'stynx-flow-empty-state',
  standalone: true,
  imports: [StynxHasPermissionDirective, StynxIconComponent],
  template: `
    <section class="stynx-flow-empty-state">
      <span class="stynx-flow-empty-state-icon" aria-hidden="true">
        <stynx-icon [name]="iconName"></stynx-icon>
      </span>
      <div>
        <h3>{{ heading }}</h3>
        @if (message) {
          <p>{{ message }}</p>
        }
      </div>
      @if (actionLabel) {
        @if (actionPermission) {
          <button type="button" *stynxHasPermission="actionPermission" (click)="action.emit()">
            <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
            {{ actionLabel }}
          </button>
        } @else {
          <button type="button" (click)="action.emit()">
            <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
            {{ actionLabel }}
          </button>
        }
      }
    </section>
  `,
  styles: [`
    .stynx-flow-empty-state {
      display: grid;
      justify-items: center;
      gap: 0.85rem;
      padding: 2rem;
      border: 1px dashed color-mix(in srgb, var(--mat-sys-outline, #94a3b8) 65%, transparent);
      border-radius: 8px;
      background: var(--mat-sys-surface-container-lowest, #ffffff);
      color: var(--mat-sys-on-surface, #0f172a);
      text-align: center;
    }

    .stynx-flow-empty-state-icon {
      display: inline-grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 999px;
      background: var(--mat-sys-primary-container, #dbeafe);
      color: var(--mat-sys-on-primary-container, #1e3a8a);
    }

    .stynx-flow-empty-state-icon stynx-icon {
      --stynx-icon-size: 1.35rem;
    }

    h3,
    p {
      margin: 0;
    }

    h3 {
      font-size: 1rem;
      font-weight: 650;
    }

    p {
      margin-top: 0.35rem;
      max-width: 32rem;
      color: var(--mat-sys-on-surface-variant, #5d6673);
    }

    button {
      min-height: 2.5rem;
      border-radius: 8px;
      padding: 0 1rem;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }

    button stynx-icon {
      --stynx-icon-size: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowEmptyStateComponent {
  @Input() heading = '';
  @Input() message = '';
  @Input() actionLabel = '';
  @Input() actionPermission = '';
  @Input() iconName = 'form';
  @Output() readonly action = new EventEmitter<void>();
}
