import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import type { OnChanges, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StynxHasPermissionDirective } from '@stynx-web/angular-auth';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxBannerComponent, StynxIconComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { FlowApiService } from './flow-api.service';
import { STYNX_FLOW_TENANT_CHANGED } from './tokens';
import type { FlowTask } from './types';

@Component({
  selector: 'stynx-flow-task-card',
  standalone: true,
  imports: [StynxHasPermissionDirective, StynxIconComponent, StynxTranslatePipe],
  template: `
    <article class="task">
      <header>
        <strong>{{ task?.nodeName || task?.nodeCode || ('flow.tasks.card.fallbackTitle' | stynxTranslate) }}</strong>
        <span>{{ task?.status || '' }}</span>
      </header>
      <p>{{ task?.note || '' }}</p>
      <footer>
        @for (action of task?.allowedActions || []; track action) {
          <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="act.emit(action)">
            <stynx-icon name="check" aria-hidden="true"></stynx-icon>
            {{ action }}
          </button>
        }
        <button type="button" *stynxHasPermission="'flow:assign:task'" (click)="assign.emit()">
          <stynx-icon name="user" aria-hidden="true"></stynx-icon>
          {{ 'flow.tasks.actions.assign' | stynxTranslate }}
        </button>
      </footer>
    </article>
  `,
  styles: [`.task { display: grid; gap: 0.75rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; background: #ffffff; } header, footer { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; } button { display: inline-flex; align-items: center; gap: 0.4rem; } stynx-icon { --stynx-icon-size: 1rem; } p { margin: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowTaskCardComponent {
  readonly mutationPermissions = {
    act: 'flow:execute:task',
    assign: 'flow:assign:task',
  };

  @Input() task: FlowTask | undefined;
  @Output() readonly act = new EventEmitter<string>();
  @Output() readonly assign = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-task-list',
  standalone: true,
  imports: [StynxBannerComponent, StynxFlowTaskCardComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ 'flow.tasks.assignments.title' | stynxTranslate }}</h2>
      </header>
      @if (loading) {
        <stynx-loading-spinner [label]="'flow.tasks.loading' | stynxTranslate"></stynx-loading-spinner>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
      @for (task of tasks; track task.id) {
        <stynx-flow-task-card
          [task]="task"
          (act)="act.emit({ task, action: $event })"
          (assign)="assign.emit(task)"
        ></stynx-flow-task-card>
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } h2 { margin: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowTaskListComponent implements OnChanges {
  private readonly api = inject(FlowApiService);

  @Input() mine = false;
  @Input() status = 'open';
  @Output() readonly act = new EventEmitter<{ task: FlowTask; action: string }>();
  @Output() readonly assign = new EventEmitter<FlowTask>();

  tasks: FlowTask[] = [];
  loading = false;
  errorMessage = '';

  async ngOnChanges(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      const page = await this.api.listTasks({ mine: this.mine, status: this.status });
      this.tasks = page.data;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Tasks load failed';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'stynx-flow-my-tasks-inbox',
  standalone: true,
  imports: [StynxBannerComponent, StynxFlowTaskCardComponent, StynxIconComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ 'flow.tasks.inbox.title' | stynxTranslate }}</h2>
        <button type="button" (click)="refresh()">
          <stynx-icon name="clock" aria-hidden="true"></stynx-icon>
          {{ 'flow.tasks.inbox.refresh' | stynxTranslate }}
        </button>
      </header>
      @if (loading()) {
        <stynx-loading-spinner [label]="'flow.tasks.loading' | stynxTranslate"></stynx-loading-spinner>
      }
      @if (errorMessage()) {
        <stynx-banner tone="error" [message]="errorMessage()"></stynx-banner>
      }
      @if (!loading() && !errorMessage() && tasks().length === 0) {
        <stynx-banner tone="info" [message]="'flow.tasks.inbox.empty' | stynxTranslate"></stynx-banner>
      }
      @for (task of tasks(); track task.id) {
        <stynx-flow-task-card
          [task]="task"
          (act)="act.emit({ task, action: $event })"
          (assign)="assign.emit(task)"
        ></stynx-flow-task-card>
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } header { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; } h2 { margin: 0; } button { display: inline-flex; align-items: center; gap: 0.4rem; } stynx-icon { --stynx-icon-size: 1rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowMyTasksInboxComponent implements OnInit {
  private readonly api = inject(FlowApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tenantChanges = inject(STYNX_FLOW_TENANT_CHANGED, { optional: true });
  private readonly pollingIntervalMsState = signal(30_000);
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private started = false;
  private refreshId = 0;

  readonly tasks = signal<FlowTask[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  @Input()
  set pollingIntervalMs(value: number | string | null | undefined) {
    this.pollingIntervalMsState.set(this.normalizePollingInterval(value));
    this.configurePolling();
  }

  get pollingIntervalMs(): number {
    return this.pollingIntervalMsState();
  }

  @Output() readonly act = new EventEmitter<{ task: FlowTask; action: string }>();
  @Output() readonly assign = new EventEmitter<FlowTask>();

  ngOnInit(): void {
    this.started = true;
    this.destroyRef.onDestroy(() => this.stopPolling());
    this.tenantChanges
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.refresh();
      });
    this.configurePolling();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const refreshId = ++this.refreshId;
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const page = await this.api.listTasks({ assignee: 'me', status: 'open' });
      if (refreshId === this.refreshId) {
        this.tasks.set(page.data);
      }
    } catch (error) {
      if (refreshId === this.refreshId) {
        this.errorMessage.set(error instanceof Error ? error.message : 'My tasks load failed');
      }
    } finally {
      if (refreshId === this.refreshId) {
        this.loading.set(false);
      }
    }
  }

  private normalizePollingInterval(value: number | string | null | undefined): number {
    if (value === null || value === undefined || value === '') {
      return 30_000;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 30_000;
  }

  private configurePolling(): void {
    this.stopPolling();
    if (!this.started || this.pollingIntervalMsState() === 0) {
      return;
    }
    this.pollHandle = setInterval(() => {
      void this.refresh();
    }, this.pollingIntervalMsState());
  }

  private stopPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
  }
}

@Component({
  selector: 'stynx-flow-task-assignment-dialog',
  standalone: true,
  imports: [StynxIconComponent, StynxTranslatePipe],
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ 'flow.tasks.assignmentDialog.title' | stynxTranslate }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="dismissed.emit()">{{ 'flow.common.cancel' | stynxTranslate }}</button>
          <button type="button" (click)="assign.emit(userId)">
            <stynx-icon name="user" aria-hidden="true"></stynx-icon>
            {{ 'flow.tasks.actions.assign' | stynxTranslate }}
          </button>
        </footer>
      </section>
    }
  `,
  styles: [`.dialog { display: grid; gap: 1rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 1rem; } footer { display: flex; justify-content: flex-end; gap: 0.75rem; } button { display: inline-flex; align-items: center; gap: 0.4rem; } stynx-icon { --stynx-icon-size: 1rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowTaskAssignmentDialogComponent {
  @Input() open = false;
  @Input() userId = '';
  @Output() readonly assign = new EventEmitter<string>();
  @Output() readonly dismissed = new EventEmitter<void>();
}
