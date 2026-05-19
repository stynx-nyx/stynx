import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { StynxBannerComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { FlowApiService } from './flow-api.service';
import type { FlowOpenTask, FlowRunSummary } from './types';

@Component({
  selector: 'stynx-flow-open-tasks',
  standalone: true,
  imports: [StynxBannerComponent, StynxLoadingSpinnerComponent],
  template: `
    <section class="surface">
      <header>
        <h2>Open tasks</h2>
      </header>
      @if (loading) {
        <stynx-loading-spinner label="Loading open tasks"></stynx-loading-spinner>
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
  imports: [StynxBannerComponent, StynxLoadingSpinnerComponent],
  template: `
    <section class="surface">
      <header>
        <h2>Run summary</h2>
      </header>
      @if (loading) {
        <stynx-loading-spinner label="Loading run summary"></stynx-loading-spinner>
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
