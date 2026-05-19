import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxConfirmDialogComponent } from '@stynx-web/angular-ui';
import type { StynxUser } from './types';

@Component({
  selector: 'stynx-user-disable-confirm-dialog',
  standalone: true,
  imports: [StynxConfirmDialogComponent, StynxTranslatePipe],
  template: `
    <stynx-confirm-dialog
      [open]="open"
      [title]="'iam.users.disable.title' | stynxTranslate"
      [message]="'iam.users.disable.message' | stynxTranslate: { email: user?.email || '' }"
      [confirmLabel]="'iam.users.disable.confirm' | stynxTranslate"
      (confirm)="confirm.emit()"
      (dismissed)="dismissed.emit()"
    ></stynx-confirm-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxUserDisableConfirmDialogComponent {
  @Input() open = false;
  @Input() user: StynxUser | null = null;
  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly dismissed = new EventEmitter<void>();
}
