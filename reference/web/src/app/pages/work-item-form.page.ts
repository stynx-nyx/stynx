import { NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StynxBannerComponent } from '@stynx-web/angular-ui';
import { ReferenceWebApiService } from '../core/reference-web-api.service';
import type { RecordItem } from '../core/reference-models';

function dateInputValue(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

@Component({
  selector: 'stynx-reference-work-item-form-page',
  standalone: true,
  imports: [NgIf, NgFor, ReactiveFormsModule, RouterLink, StynxBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>{{ editingId ? 'Transition work item' : 'Create work item' }}</h2>
          <p>Use the sample workflow to move an item from draft to done.</p>
        </div>
        <a routerLink="/work-items">Back to work items</a>
      </div>

      <form class="form" [formGroup]="form" (ngSubmit)="submit()">
        <label>
          Record
          <select formControlName="recordId" data-testid="work-item-record-select">
            @for (record of records; track record.id) {
              <option [value]="record.id">{{ record.title }}</option>
            }
          </select>
        </label>

        <label>Code <input formControlName="code" data-testid="work-item-code-input" /></label>
        <label>Opened on <input type="date" formControlName="openedOn" /></label>
        <label>Target on <input type="date" formControlName="targetOn" /></label>
        <label>Category <input formControlName="category" /></label>
        <label>Total units <input type="number" formControlName="totalUnits" min="0" /></label>
        <label>
          Status
          <select formControlName="status">
            <option value="draft">draft</option>
            <option value="ready">ready</option>
            <option value="done">done</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>

        @if (errorMessage) {
          <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
        }

        <button
          type="submit"
          [disabled]="form.invalid || pending"
          data-testid="work-item-save-submit"
        >
          {{ pending ? 'Saving...' : editingId ? 'Save transition' : 'Create work item' }}
        </button>
      </form>
    </section>
  `,
  styles: [
    `
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
        max-width: 42rem;
      }

      label {
        display: grid;
        gap: 0.45rem;
      }

      input,
      select,
      button {
        border-radius: 14px;
        border: 1px solid var(--app-line);
        padding: 0.85rem 1rem;
        background: white;
      }
    `,
  ],
})
export class WorkItemFormPageComponent implements OnInit {
  private readonly api = inject(ReferenceWebApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly form = this.formBuilder.nonNullable.group({
    recordId: ['', [Validators.required]],
    code: ['', [Validators.required]],
    openedOn: [dateInputValue(), [Validators.required]],
    targetOn: [dateInputValue(7), [Validators.required]],
    category: ['GEN'],
    totalUnits: [0, [Validators.min(0)]],
    status: this.formBuilder.nonNullable.control<'draft' | 'ready' | 'done' | 'cancelled'>(
      'draft',
      [Validators.required],
    ),
  });

  protected records: RecordItem[] = [];
  protected editingId: string | null = null;
  protected pending = false;
  protected errorMessage = '';

  async ngOnInit(): Promise<void> {
    this.records = await this.api.listRecords();
    this.editingId = this.route.snapshot.paramMap.get('id');
    if (!this.form.controls.recordId.value && this.records[0]?.id) {
      this.form.controls.recordId.setValue(this.records[0].id);
    }
    if (!this.editingId) {
      return;
    }
    const item = await this.api.getWorkItem(this.editingId);
    this.form.reset({
      recordId: item.recordId,
      code: item.code,
      openedOn: item.openedOn,
      targetOn: item.targetOn,
      category: item.category,
      totalUnits: item.totalUnits,
      status: item.status,
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    this.pending = true;
    this.errorMessage = '';
    try {
      const payload = {
        ...value,
        totalUnits: Number(value.totalUnits),
      };
      if (this.editingId) {
        const updated = await this.api.updateWorkItem(this.editingId, payload);
        await this.router.navigate(['/work-items', updated.id]);
      } else {
        const created = await this.api.createWorkItem(payload);
        await this.router.navigate(['/work-items', created.id]);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save work item.';
    } finally {
      this.pending = false;
    }
  }
}
