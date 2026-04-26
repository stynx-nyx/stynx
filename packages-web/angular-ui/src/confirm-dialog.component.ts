import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'stynx-confirm-dialog',
  standalone: true,
  template: `
    @if (open) {
      <section class="stynx-confirm-backdrop">
        <div class="stynx-confirm-dialog">
          <h3>{{ title }}</h3>
          <p>{{ message }}</p>
          <footer>
            <button type="button" (click)="cancel.emit()">Cancel</button>
            <button type="button" (click)="confirm.emit()">{{ confirmLabel }}</button>
          </footer>
        </div>
      </section>
    }
  `,
  styles: [`
    .stynx-confirm-backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(15, 23, 42, 0.32);
    }

    .stynx-confirm-dialog {
      width: min(28rem, calc(100vw - 2rem));
      background: white;
      border-radius: 18px;
      padding: 1.25rem;
      display: grid;
      gap: 1rem;
    }

    footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxConfirmDialogComponent {
  @Input() open = false;
  @Input() title = 'Confirm';
  @Input() message = '';
  @Input() confirmLabel = 'Confirm';
  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly cancel = new EventEmitter<void>();
}
