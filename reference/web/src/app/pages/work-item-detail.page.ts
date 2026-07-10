import { DatePipe, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StynxBannerComponent } from '@stynx-nyx/angular-ui';
import { ReferenceWebApiService } from '../core/reference-web-api.service';
import type { WorkItem } from '../core/reference-models';

@Component({
  selector: 'stynx-reference-work-item-detail-page',
  standalone: true,
  imports: [DatePipe, NgIf, RouterLink, StynxBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      @if (item(); as currentItem) {
        <div class="panel__header">
          <div>
            <h2 data-testid="work-item-detail-title">{{ currentItem.code }}</h2>
            <p>Status {{ currentItem.status }} · target {{ currentItem.targetOn }}</p>
          </div>
          <div class="actions">
            <a [routerLink]="['/work-items', currentItem.id]">Refresh</a>
            <a
              [routerLink]="['/work-items', currentItem.id, 'edit']"
              data-testid="work-item-edit-link"
              >Transition</a
            >
            <a [routerLink]="['/work-items']">Back</a>
            <a [routerLink]="['/work-items/new']">Create another</a>
          </div>
        </div>

        <dl class="detail-grid">
          <div>
            <dt>Record</dt>
            <dd>{{ currentItem.recordId }}</dd>
          </div>
          <div>
            <dt>Opened</dt>
            <dd>{{ currentItem.openedOn }}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{{ currentItem.category }}</dd>
          </div>
          <div>
            <dt>Total units</dt>
            <dd>{{ currentItem.totalUnits }}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{{ currentItem.createdAt | date: 'medium' }}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{{ currentItem.updatedAt | date: 'medium' }}</dd>
          </div>
        </dl>

        <article class="transition-card" id="transition">
          <h3>Transition</h3>
          <p>Use the transition form to update the work-item status.</p>
          <a [routerLink]="['/work-items', currentItem.id, 'edit']">Open edit form</a>
        </article>
      } @else if (errorMessage()) {
        <stynx-banner tone="error" [message]="errorMessage()"></stynx-banner>
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
      .actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        justify-content: space-between;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
        margin: 0;
      }

      dt {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--app-muted);
      }

      dd {
        margin: 0.35rem 0 0;
      }

      .transition-card {
        padding: 1rem;
        border-radius: 18px;
        background: white;
      }
    `,
  ],
})
export class WorkItemDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReferenceWebApiService);
  protected readonly item = signal<WorkItem | null>(null);
  protected readonly errorMessage = signal('');

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage.set('Work item id is required.');
      return;
    }
    try {
      this.item.set(await this.api.getWorkItem(id));
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load work item.');
    }
  }
}
