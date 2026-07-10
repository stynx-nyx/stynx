import { NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  StynxBannerComponent,
  EmptyStateComponent,
  StynxLoadingSpinnerComponent,
  StynxTableComponent,
} from '@stynx-nyx/angular-ui';
import { ReferenceWebApiService } from '../core/reference-web-api.service';
import type { RecordItem } from '../core/reference-models';

@Component({
  selector: 'stynx-reference-records-page',
  standalone: true,
  imports: [
    NgFor,
    NgIf,
    RouterLink,
    EmptyStateComponent,
    StynxBannerComponent,
    StynxLoadingSpinnerComponent,
    StynxTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2 data-testid="records-title">Records</h2>
          <p>List, inspect, create, edit, and delete sample records.</p>
        </div>
        <a routerLink="/records/new">Create record</a>
      </div>

      @if (errorMessage()) {
        <stynx-banner tone="error" [message]="errorMessage()"></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner label="Loading records"></stynx-loading-spinner>
      } @else if (rows().length === 0) {
        <stynx-empty-state
          title="No records yet"
          description="Create a record to start the sample workflow."
        ></stynx-empty-state>
      } @else {
        <stynx-table [columns]="columns" [rows]="rows()"></stynx-table>
        <div class="card-list">
          @for (record of rows(); track record.id) {
            <article class="card" [attr.data-testid]="'record-row-' + record.id">
              <div>
                <strong>{{ record.title }}</strong>
                <span>{{ record.email }} · {{ record.status }}</span>
              </div>
              <div class="card__actions">
                <a [routerLink]="['/records', record.id]">Open</a>
                <a [routerLink]="['/records', record.id, 'edit']">Edit</a>
                <button
                  type="button"
                  (click)="deleteRecord(record.id)"
                  [attr.data-testid]="'record-delete-' + record.id"
                >
                  Delete
                </button>
              </div>
            </article>
          }
        </div>
      }
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

      .panel__header,
      .card,
      .card__actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .panel__header {
        justify-content: space-between;
        align-items: flex-start;
      }

      .card-list {
        display: grid;
        gap: 0.75rem;
      }

      .card {
        justify-content: space-between;
        align-items: center;
        padding: 0.9rem 1rem;
        border-radius: 16px;
        background: white;
      }
    `,
  ],
})
export class RecordsPageComponent implements OnInit {
  private readonly api = inject(ReferenceWebApiService);
  protected readonly rows = signal<RecordItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly columns = [
    { key: 'title', label: 'Title' },
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Status' },
  ] as const;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      this.rows.set(await this.api.listRecords());
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load records.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteRecord(id: string): Promise<void> {
    try {
      await this.api.deleteRecord(id);
      await this.load();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to delete record.');
    }
  }
}
