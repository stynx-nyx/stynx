import { NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StynxBannerComponent } from '@stynx-web/angular-ui';
import { ReferenceWebApiService } from '../core/reference-web-api.service';

@Component({
  selector: 'stynx-reference-record-form-page',
  standalone: true,
  imports: [NgIf, ReactiveFormsModule, RouterLink, StynxBannerComponent],
  template: `
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>{{ editingId ? 'Edit record' : 'Create record' }}</h2>
          <p>{{ editingId ? 'Update the sample record fields.' : 'Create a record for the work-item flow.' }}</p>
        </div>
        <a routerLink="/records">Back to records</a>
      </div>

      <form class="form" [formGroup]="form" (ngSubmit)="submit()">
        <label>Title <input formControlName="title" data-testid="record-title-input" /></label>
        <label>Email <input type="email" formControlName="email" data-testid="record-email-input" /></label>
        <label>External reference <input formControlName="externalRef" /></label>
        <label>
          Status
          <select formControlName="status">
            <option value="active">active</option>
            <option value="pending">pending</option>
            <option value="inactive">inactive</option>
          </select>
        </label>

        @if (errorMessage) {
          <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
        }

        <button type="submit" [disabled]="form.invalid || pending" data-testid="record-save-submit">
          {{ pending ? 'Saving...' : editingId ? 'Save changes' : 'Create record' }}
        </button>
      </form>
    </section>
  `,
  styles: [`
    .panel {
      display: grid;
      gap: 1rem;
      padding: 1.5rem;
      border-radius: 24px;
      background: var(--app-card);
      border: 1px solid var(--app-line);
    }

    .panel__header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .form {
      display: grid;
      gap: 1rem;
      max-width: 40rem;
    }

    label {
      display: grid;
      gap: 0.4rem;
    }

    input,
    select,
    button {
      border-radius: 14px;
      border: 1px solid var(--app-line);
      padding: 0.85rem 1rem;
      background: white;
    }
  `],
})
export class RecordFormPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ReferenceWebApiService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly form = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    externalRef: [''],
    status: this.formBuilder.nonNullable.control<'active' | 'pending' | 'inactive'>('active', [Validators.required]),
  });

  protected editingId: string | null = null;
  protected pending = false;
  protected errorMessage = '';

  async ngOnInit(): Promise<void> {
    this.editingId = this.route.snapshot.paramMap.get('id');
    if (!this.editingId) {
      return;
    }
    const record = await this.api.getRecord(this.editingId);
    this.form.reset({
      title: record.title,
      email: record.email,
      externalRef: record.externalRef ?? '',
      status: record.status,
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      return;
    }
    this.pending = true;
    this.errorMessage = '';
    const value = this.form.getRawValue();
    try {
      if (this.editingId) {
        const updated = await this.api.updateRecord(this.editingId, {
          title: value.title,
          email: value.email,
          externalRef: value.externalRef || null,
          status: value.status,
        });
        await this.router.navigate(['/records', updated.id]);
      } else {
        const created = await this.api.createRecord({
          title: value.title,
          email: value.email,
          externalRef: value.externalRef || null,
          status: value.status,
        });
        await this.router.navigate(['/records', created.id]);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save record.';
    } finally {
      this.pending = false;
    }
  }
}
