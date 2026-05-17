import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Input, Output } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { StynxHasPermissionDirective } from '@stynx-web/angular-auth';
import { StynxBannerComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { FlowApiService } from './flow-api.service';
import type { FlowAnswer, FlowFill, FlowQuestion } from './types';

@Component({
  selector: 'stynx-flow-fills',
  standalone: true,
  imports: [StynxBannerComponent, StynxHasPermissionDirective, StynxLoadingSpinnerComponent],
  template: `
    <section class="surface">
      <header>
        <h2>Fills</h2>
        <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="create.emit()">New fill</button>
      </header>
      @if (loading) {
        <stynx-loading-spinner label="Loading fills"></stynx-loading-spinner>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
      @for (fill of fills; track fill.id) {
        <button type="button" class="item" (click)="select.emit(fill)">
          <strong>{{ fill.targetType }} {{ fill.targetId }}</strong>
          <span>{{ fill.status }}</span>
        </button>
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } header { display: flex; justify-content: space-between; align-items: center; } h2 { margin: 0; } .item { border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; text-align: left; background: #ffffff; display: grid; gap: 0.25rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowFillsComponent implements OnChanges {
  @Input() formId = '';
  @Input() targetType = '';
  @Input() targetId = '';
  @Output() readonly create = new EventEmitter<void>();
  @Output() readonly select = new EventEmitter<FlowFill>();

  fills: FlowFill[] = [];
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
      const filters: { formId?: string; targetType?: string; targetId?: string } = {};
      if (this.formId) {
        filters.formId = this.formId;
      }
      if (this.targetType) {
        filters.targetType = this.targetType;
      }
      if (this.targetId) {
        filters.targetId = this.targetId;
      }
      this.fills = await this.api.listFills(filters);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Fills load failed';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'stynx-flow-fill-editor',
  standalone: true,
  imports: [StynxHasPermissionDirective],
  template: `
    <section class="surface">
      <header>
        <h2>{{ fill?.targetId || 'Fill' }}</h2>
        <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="submit.emit(fill || {})">Submit</button>
      </header>
      @for (question of questions; track question.id) {
        <article class="answer">
          <strong>{{ question.label }}</strong>
          <span>{{ answerFor(question.id)?.value || '' }}</span>
        </article>
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } header { display: flex; justify-content: space-between; align-items: center; } h2 { margin: 0; } .answer { border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; display: grid; gap: 0.25rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowFillEditorComponent {
  @Input() fill: Partial<FlowFill> | undefined;
  @Input() questions: FlowQuestion[] = [];
  @Input() answers: FlowAnswer[] = [];
  @Output() readonly submit = new EventEmitter<Partial<FlowFill>>();
  @Output() readonly answer = new EventEmitter<Partial<FlowAnswer>>();

  answerFor(questionId: string): FlowAnswer | undefined {
    return this.answers.find((item) => item.questionId === questionId);
  }
}
