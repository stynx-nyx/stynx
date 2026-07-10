import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { StynxBannerComponent, StynxIconComponent, StynxLoadingSpinnerComponent } from '@stynx-nyx/angular-ui';
import { FlowApiService } from './flow-api.service';
import type { FlowRunActivityEvent } from './types';

@Component({
  selector: 'stynx-flow-run-activity',
  standalone: true,
  imports: [StynxBannerComponent, StynxIconComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="activity">
      <header>
        <h2>{{ 'flow.activity.title' | stynxTranslate }}</h2>
        <button type="button" (click)="refresh()">
          <stynx-icon name="clock" aria-hidden="true"></stynx-icon>
          {{ 'flow.activity.actions.refresh' | stynxTranslate }}
        </button>
      </header>
      @if (loading()) {
        <stynx-loading-spinner [label]="'flow.activity.loading' | stynxTranslate"></stynx-loading-spinner>
      }
      @if (errorMessage()) {
        <stynx-banner tone="error" [message]="errorMessage()"></stynx-banner>
      }
      @if (!loading() && !errorMessage() && events().length === 0) {
        <stynx-banner tone="info" [message]="'flow.activity.empty' | stynxTranslate"></stynx-banner>
      }
      <ol class="timeline">
        @for (event of events(); track event.id) {
          <li>
            <span class="marker" aria-hidden="true"></span>
            <article>
              <strong>{{ event.kind }}</strong>
              @if (event.createdAt) {
                <time [attr.datetime]="event.createdAt">{{ event.createdAt }}</time>
              }
              @if (event.note) {
                <p>{{ event.note }}</p>
              }
            </article>
          </li>
        }
      </ol>
      @if (hasNextPage()) {
        <button type="button" class="secondary" (click)="loadNextPage()">
          {{ 'flow.activity.actions.more' | stynxTranslate }}
        </button>
      }
    </section>
  `,
  styles: [`
    .activity {
      display: grid;
      gap: 0.75rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: center;
    }

    h2,
    p {
      margin: 0;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }

    stynx-icon {
      --stynx-icon-size: 1rem;
    }

    .timeline {
      display: grid;
      gap: 0;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    li {
      display: grid;
      grid-template-columns: 1rem minmax(0, 1fr);
      gap: 0.75rem;
      padding-block: 0.25rem 0.85rem;
      position: relative;
    }

    li::before {
      content: '';
      position: absolute;
      left: 0.45rem;
      top: 1rem;
      bottom: 0;
      border-left: 1px solid #d8dee9;
    }

    li:last-child::before {
      display: none;
    }

    .marker {
      width: 0.65rem;
      height: 0.65rem;
      margin-top: 0.25rem;
      border-radius: 999px;
      background: #2563eb;
      position: relative;
      z-index: 1;
    }

    article {
      display: grid;
      gap: 0.2rem;
      border: 1px solid #d8dee9;
      border-radius: 8px;
      padding: 0.75rem;
      background: #ffffff;
    }

    time {
      font-size: 0.85rem;
      color: #64748b;
    }

    .secondary {
      justify-self: start;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowRunActivityComponent implements OnChanges {
  private readonly api = inject(FlowApiService);
  private page = 1;
  private refreshId = 0;

  readonly events = signal<FlowRunActivityEvent[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly hasNextPage = signal(false);

  @Input() runId = '';
  @Input() pageSize = 25;
  @Output() readonly selected = new EventEmitter<FlowRunActivityEvent>();

  async ngOnChanges(): Promise<void> {
    this.page = 1;
    await this.load(false);
  }

  async refresh(): Promise<void> {
    this.page = 1;
    await this.load(false);
  }

  async loadNextPage(): Promise<void> {
    this.page += 1;
    await this.load(true);
  }

  private async load(append: boolean): Promise<void> {
    if (!this.runId) {
      this.events.set([]);
      this.hasNextPage.set(false);
      return;
    }

    const refreshId = ++this.refreshId;
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const page = await this.api.listRunActivity(this.runId, {
        page: this.page,
        pageSize: this.pageSize,
      });
      if (refreshId !== this.refreshId) {
        return;
      }
      this.events.set(append ? [...this.events(), ...page.data] : page.data);
      this.hasNextPage.set(page.meta.page * page.meta.pageSize < page.meta.total);
    } catch (error) {
      if (refreshId === this.refreshId) {
        this.errorMessage.set(error instanceof Error ? error.message : 'Run activity load failed');
      }
    } finally {
      if (refreshId === this.refreshId) {
        this.loading.set(false);
      }
    }
  }
}
