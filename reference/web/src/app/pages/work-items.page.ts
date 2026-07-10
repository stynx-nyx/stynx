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
import type { WorkItem } from '../core/reference-models';

@Component({
  selector: 'stynx-reference-work-items-page',
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
          <h2 data-testid="work-items-title">Work items</h2>
          <p>Create, transition, and archive work items linked to records.</p>
        </div>
        <a routerLink="/work-items/new">Create work item</a>
      </div>

      @if (errorMessage()) {
        <stynx-banner tone="error" [message]="errorMessage()"></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner label="Loading work items"></stynx-loading-spinner>
      } @else if (rows().length === 0) {
        <stynx-empty-state
          title="No work items yet"
          description="Create a work item after adding a record."
        ></stynx-empty-state>
      } @else {
        <stynx-table [columns]="columns" [rows]="rows()"></stynx-table>
        <div class="card-list">
          @for (item of rows(); track item.id) {
            <article class="card" [attr.data-testid]="'work-item-row-' + item.id">
              <div>
                <strong>{{ item.code }}</strong>
                <span>{{ item.status }} · target {{ item.targetOn }}</span>
              </div>
              <div class="card__actions">
                <a [routerLink]="['/work-items', item.id]">Open</a>
                <button
                  type="button"
                  (click)="deleteWorkItem(item.id)"
                  [attr.data-testid]="'work-item-delete-' + item.id"
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
export class WorkItemsPageComponent implements OnInit {
  private readonly api = inject(ReferenceWebApiService);
  protected readonly rows = signal<WorkItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly columns = [
    { key: 'code', label: 'Code' },
    { key: 'status', label: 'Status' },
    { key: 'targetOn', label: 'Target' },
  ] as const;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      this.rows.set(await this.api.listWorkItems());
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load work items.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteWorkItem(id: string): Promise<void> {
    try {
      await this.api.deleteWorkItem(id);
      await this.load();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to delete work item.');
    }
  }
}
