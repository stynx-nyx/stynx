import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Input, Output } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { StynxHasPermissionDirective } from '@stynx-web/angular-auth';
import { StynxBannerComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { FlowApiService } from './flow-api.service';
import type { FlowTask } from './types';

@Component({
  selector: 'stynx-flow-task-card',
  standalone: true,
  imports: [StynxHasPermissionDirective],
  template: `
    <article class="task">
      <header>
        <strong>{{ task?.nodeName || task?.nodeCode || 'Task' }}</strong>
        <span>{{ task?.status || '' }}</span>
      </header>
      <p>{{ task?.note || '' }}</p>
      <footer>
        @for (action of task?.allowedActions || []; track action) {
          <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="act.emit(action)">
            {{ action }}
          </button>
        }
        <button type="button" *stynxHasPermission="'flow:assign:task'" (click)="assign.emit()">Assign</button>
      </footer>
    </article>
  `,
  styles: [`.task { display: grid; gap: 0.75rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; background: #ffffff; } header, footer { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; } p { margin: 0; }`],
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
  imports: [StynxBannerComponent, StynxFlowTaskCardComponent, StynxLoadingSpinnerComponent],
  template: `
    <section class="surface">
      <header>
        <h2>Assignments</h2>
      </header>
      @if (loading) {
        <stynx-loading-spinner label="Loading tasks"></stynx-loading-spinner>
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
  @Input() mine = false;
  @Input() status = 'open';
  @Output() readonly act = new EventEmitter<{ task: FlowTask; action: string }>();
  @Output() readonly assign = new EventEmitter<FlowTask>();

  tasks: FlowTask[] = [];
  loading = false;
  errorMessage = '';

  constructor(@Inject(FlowApiService) private readonly api: FlowApiService) {}

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
  selector: 'stynx-flow-task-assignment-dialog',
  standalone: true,
  template: `
    @if (open) {
      <section class="dialog">
        <h3>Assign task</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="cancel.emit()">Cancel</button>
          <button type="button" (click)="assign.emit(userId)">Assign</button>
        </footer>
      </section>
    }
  `,
  styles: [`.dialog { display: grid; gap: 1rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 1rem; } footer { display: flex; justify-content: flex-end; gap: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowTaskAssignmentDialogComponent {
  @Input() open = false;
  @Input() userId = '';
  @Output() readonly assign = new EventEmitter<string>();
  @Output() readonly cancel = new EventEmitter<void>();
}
