import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import type { OnChanges, OnInit } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxBannerComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { FlowApiService } from './flow-api.service';
import type { FlowDashboardAnalytics, FlowOpenTask, FlowRunSummary } from './types';

@Component({
  selector: 'stynx-flow-open-tasks',
  standalone: true,
  imports: [StynxBannerComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ 'flow.analytics.openTasks.title' | stynxTranslate }}</h2>
      </header>
      @if (loading) {
        <stynx-loading-spinner [label]="'flow.analytics.openTasks.loading' | stynxTranslate"></stynx-loading-spinner>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
      @for (task of tasks; track task.id) {
        <article class="item">
          <strong>{{ task.nodeName || task.nodeCode || task.id }}</strong>
          <span>{{ task.targetType }} {{ task.targetId }}</span>
        </article>
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } h2 { margin: 0; } .item { display: grid; gap: 0.25rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowOpenTasksComponent implements OnInit {
  private readonly api = inject(FlowApiService);

  tasks: FlowOpenTask[] = [];
  loading = false;
  errorMessage = '';

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      const page = await this.api.openTasks();
      this.tasks = page.data;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Open tasks load failed';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'stynx-flow-run-summary',
  standalone: true,
  imports: [StynxBannerComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ 'flow.analytics.runSummary.title' | stynxTranslate }}</h2>
      </header>
      @if (loading) {
        <stynx-loading-spinner [label]="'flow.analytics.runSummary.loading' | stynxTranslate"></stynx-loading-spinner>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
      @for (row of summaries; track row.scopeId + row.graphId + row.status) {
        <article class="item">
          <strong>{{ row.status }}</strong>
          <span>{{ row.runCount }}</span>
        </article>
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } h2 { margin: 0; } .item { display: flex; justify-content: space-between; border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowRunSummaryComponent implements OnInit {
  private readonly api = inject(FlowApiService);

  summaries: FlowRunSummary[] = [];
  loading = false;
  errorMessage = '';

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      const page = await this.api.runsSummary();
      this.summaries = page.data;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Run summary load failed';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'stynx-flow-dashboard',
  standalone: true,
  imports: [StynxBannerComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ 'flow.analytics.dashboard.title' | stynxTranslate }}</h2>
      </header>
      @if (loading()) {
        <stynx-loading-spinner [label]="'flow.analytics.dashboard.loading' | stynxTranslate"></stynx-loading-spinner>
      }
      @if (errorMessage()) {
        <stynx-banner tone="error" [message]="errorMessage()"></stynx-banner>
      }
      @if (metrics(); as row) {
        <div class="metrics">
          <article class="metric">
            <span>{{ 'flow.analytics.dashboard.openTasks' | stynxTranslate }}</span>
            <strong>{{ row.openTasks }}</strong>
          </article>
          <article class="metric">
            <span>{{ 'flow.analytics.dashboard.cycleTimeP50' | stynxTranslate }}</span>
            <strong>{{ 'flow.analytics.dashboard.seconds' | stynxTranslate: { count: row.cycleTime.p50Seconds } }}</strong>
          </article>
          <article class="metric">
            <span>{{ 'flow.analytics.dashboard.cycleTimeP95' | stynxTranslate }}</span>
            <strong>{{ 'flow.analytics.dashboard.seconds' | stynxTranslate: { count: row.cycleTime.p95Seconds } }}</strong>
          </article>
          <article class="metric">
            <span>{{ 'flow.analytics.dashboard.completion7' | stynxTranslate }}</span>
            <strong>{{ percent(row.completionRate.last7Days) }}</strong>
          </article>
          <article class="metric">
            <span>{{ 'flow.analytics.dashboard.completion30' | stynxTranslate }}</span>
            <strong>{{ percent(row.completionRate.last30Days) }}</strong>
          </article>
          <article class="metric">
            <span>{{ 'flow.analytics.dashboard.slaBreaches' | stynxTranslate }}</span>
            <strong>{{ row.slaBreaches }}</strong>
          </article>
        </div>
      }
    </section>
  `,
  styles: [`
    .surface {
      display: grid;
      gap: 0.75rem;
    }

    h2 {
      margin: 0;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 0.75rem;
    }

    .metric {
      display: grid;
      gap: 0.35rem;
      border: 1px solid #d8dee9;
      border-radius: 8px;
      padding: 0.85rem;
      background: #ffffff;
    }

    .metric span {
      color: #475569;
      font-size: 0.875rem;
    }

    .metric strong {
      font-size: 1.45rem;
      line-height: 1.1;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowDashboardComponent implements OnChanges {
  private readonly api = inject(FlowApiService);
  private refreshId = 0;

  readonly metrics = signal<FlowDashboardAnalytics | undefined>(undefined);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  @Input() scopeId = '';
  @Input() scopeCode = '';
  @Input() graphId = '';

  async ngOnChanges(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const refreshId = ++this.refreshId;
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const filters: { scopeId?: string; scopeCode?: string; graphId?: string } = {};
      if (this.scopeId) {
        filters.scopeId = this.scopeId;
      }
      if (this.scopeCode) {
        filters.scopeCode = this.scopeCode;
      }
      if (this.graphId) {
        filters.graphId = this.graphId;
      }
      const metrics = await this.api.dashboardAnalytics(filters);
      if (refreshId === this.refreshId) {
        this.metrics.set(metrics);
      }
    } catch (error) {
      if (refreshId === this.refreshId) {
        this.errorMessage.set(error instanceof Error ? error.message : 'Dashboard analytics load failed');
      }
    } finally {
      if (refreshId === this.refreshId) {
        this.loading.set(false);
      }
    }
  }

  percent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }
}
