import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ReactiveFormsModule, Validators } from '@angular/forms';
import type { FormBuilder } from '@angular/forms';
import type { StynxProfileValue } from './types';

@Component({
  selector: 'stynx-profile-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name <input formControlName="name" /></label>
      <label>Email <input formControlName="email" /></label>
      <label>Locale <input formControlName="locale" /></label>
      <button type="submit" [disabled]="form.invalid || !form.dirty">Save</button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxProfileFormComponent {
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    locale: ['en-US', [Validators.required]],
  });

  @Output() readonly save = new EventEmitter<StynxProfileValue>();

  constructor(private readonly formBuilder: FormBuilder) {}

  @Input()
  set value(value: StynxProfileValue | null) {
    if (!value) {
      return;
    }
    this.form.reset(value);
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.save.emit(this.form.getRawValue());
    this.form.markAsPristine();
  }
}
