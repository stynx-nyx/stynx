import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Input, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import type { StynxPreferencesValue } from './types';

@Component({
  selector: 'stynx-preferences-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Locale <input formControlName="locale" /></label>
      <label>
        <input type="checkbox" formControlName="notifications" />
        Notifications
      </label>
      <ng-content></ng-content>
      <button type="submit" [disabled]="!form.dirty">Save preferences</button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxPreferencesFormComponent {
  readonly form = this.formBuilder.nonNullable.group({
    locale: ['en-US'],
    notifications: [false],
  });

  @Output() readonly save = new EventEmitter<StynxPreferencesValue>();

  constructor(@Inject(FormBuilder) private readonly formBuilder: FormBuilder) {}

  @Input()
  set value(value: StynxPreferencesValue | null) {
    if (!value) {
      return;
    }
    this.form.reset(value);
  }

  submit(): void {
    this.save.emit(this.form.getRawValue());
    this.form.markAsPristine();
  }
}
