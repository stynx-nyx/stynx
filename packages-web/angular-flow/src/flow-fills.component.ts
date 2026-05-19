import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
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
  private readonly api = inject(FlowApiService);

  @Input() formId = '';
  @Input() targetType = '';
  @Input() targetId = '';
  @Output() readonly create = new EventEmitter<void>();
  @Output() readonly select = new EventEmitter<FlowFill>();

  fills: FlowFill[] = [];
  loading = false;
  errorMessage = '';

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
        <div class="actions">
          <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="saveAllAnswers()">Save answers</button>
          <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="submit.emit(fill || {})">Submit</button>
        </div>
      </header>
      @for (question of questions; track question.id) {
        <article class="answer">
          <label [attr.for]="'flow-answer-' + question.id">
            <strong>{{ question.label }}</strong>
            @if (question.required) {
              <small>Required</small>
            }
          </label>
          @switch (question.fieldType) {
            @case ('boolean') {
              <input
                [id]="'flow-answer-' + question.id"
                type="checkbox"
                [checked]="booleanValue(question)"
                (change)="setValue(question, $any($event.target).checked)"
              />
            }
            @case ('number') {
              <input
                [id]="'flow-answer-' + question.id"
                type="number"
                [value]="numberValue(question)"
                (input)="setValue(question, $any($event.target).value)"
              />
            }
            @case ('date') {
              <input
                [id]="'flow-answer-' + question.id"
                type="date"
                [value]="dateValue(question)"
                (input)="setValue(question, $any($event.target).value)"
              />
            }
            @case ('select') {
              <select
                [id]="'flow-answer-' + question.id"
                [value]="optionKey(valueFor(question))"
                (change)="setValue(question, optionValueFromKey(question, $any($event.target).value))"
              >
                <option value=""></option>
                @for (option of questionOptions(question); track option.key) {
                  <option [value]="option.key">{{ option.label }}</option>
                }
              </select>
            }
            @case ('multiselect') {
              <select
                [id]="'flow-answer-' + question.id"
                multiple
                (change)="setMultiselectValue(question, $any($event.target).selectedOptions)"
              >
                @for (option of questionOptions(question); track option.key) {
                  <option [value]="option.key" [selected]="isSelected(question, option.value)">{{ option.label }}</option>
                }
              </select>
            }
            @case ('text') {
              <textarea
                [id]="'flow-answer-' + question.id"
                [value]="textValue(question)"
                (input)="setValue(question, $any($event.target).value)"
              ></textarea>
            }
            @default {
              <input
                [id]="'flow-answer-' + question.id"
                [type]="question.fieldType === 'email' ? 'email' : question.fieldType === 'url' ? 'url' : 'text'"
                [value]="textValue(question)"
                (input)="setValue(question, $any($event.target).value)"
              />
            }
          }
          <button type="button" class="secondary" *stynxHasPermission="'flow:assign:task'" (click)="waiveQuestion.emit(question)">
            Waive
          </button>
        </article>
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; } h2 { margin: 0; } .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; } .answer { border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; display: grid; gap: 0.5rem; } label { display: flex; gap: 0.5rem; align-items: baseline; justify-content: space-between; } input:not([type="checkbox"]), select, textarea { width: 100%; box-sizing: border-box; border: 1px solid #c7d0dd; border-radius: 6px; padding: 0.5rem; } textarea { min-height: 6rem; resize: vertical; } .secondary { justify-self: start; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowFillEditorComponent implements OnChanges {
  @Input() fill: Partial<FlowFill> | undefined;
  @Input() questions: FlowQuestion[] = [];
  @Input() answers: FlowAnswer[] = [];
  @Output() readonly submit = new EventEmitter<Partial<FlowFill>>();
  @Output() readonly answer = new EventEmitter<Partial<FlowAnswer>>();
  @Output() readonly saveAnswers = new EventEmitter<Array<Partial<FlowAnswer>>>();
  @Output() readonly waiveQuestion = new EventEmitter<FlowQuestion>();

  private readonly values = new Map<string, unknown>();

  ngOnChanges(): void {
    this.values.clear();
  }

  answerFor(questionId: string): FlowAnswer | undefined {
    return this.answers.find((item) => item.questionId === questionId);
  }

  valueFor(question: FlowQuestion): unknown {
    if (!this.values.has(question.id)) {
      this.values.set(question.id, this.parseAnswerValue(question, this.answerFor(question.id)?.value));
    }
    return this.values.get(question.id);
  }

  textValue(question: FlowQuestion): string {
    const value = this.valueFor(question);
    return value === null || value === undefined ? '' : String(value);
  }

  booleanValue(question: FlowQuestion): boolean {
    return this.valueFor(question) === true;
  }

  numberValue(question: FlowQuestion): string {
    const value = this.valueFor(question);
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  }

  dateValue(question: FlowQuestion): string {
    const value = this.valueFor(question);
    return typeof value === 'string' ? value.slice(0, 10) : '';
  }

  setValue(question: FlowQuestion, value: unknown): void {
    const parsed = this.parseInputValue(question, value);
    this.values.set(question.id, parsed);
    this.answer.emit({
      questionId: question.id,
      value: this.serializeValue(question, parsed),
    });
  }

  setMultiselectValue(question: FlowQuestion, selectedOptions: HTMLCollectionOf<HTMLOptionElement>): void {
    this.setValue(question, Array.from(selectedOptions).map((option) => this.optionValueFromKey(question, option.value)));
  }

  isSelected(question: FlowQuestion, optionValue: unknown): boolean {
    const value = this.valueFor(question);
    if (!Array.isArray(value)) {
      return false;
    }
    return value.some((item) => this.optionKey(item) === this.optionKey(optionValue));
  }

  questionOptions(question: FlowQuestion): Array<{ label: string; value: unknown; key: string }> {
    const raw = question.options ?? [];
    if (Array.isArray(raw)) {
      return raw.map((item) => this.normalizeOption(item));
    }
    if (raw && typeof raw === 'object') {
      return Object.entries(raw).map(([key, value]) => ({
        label: String(value ?? key),
        value: key,
        key,
      }));
    }
    return [];
  }

  saveAllAnswers(): void {
    this.saveAnswers.emit(this.questions.map((question) => ({
      questionId: question.id,
      value: this.serializeValue(question, this.valueFor(question)),
    })));
  }

  private parseAnswerValue(question: FlowQuestion, value: unknown): unknown {
    if (value === undefined) {
      return this.defaultValue(question);
    }
    switch (question.fieldType) {
      case 'boolean':
        return value === true || value === 'true';
      case 'number':
        if (value === null || value === '') {
          return null;
        }
        return typeof value === 'number' ? value : Number(value);
      case 'multiselect':
        if (Array.isArray(value)) {
          return value;
        }
        return value === null || value === undefined || value === '' ? [] : [value];
      default:
        return value ?? '';
    }
  }

  private parseInputValue(question: FlowQuestion, value: unknown): unknown {
    switch (question.fieldType) {
      case 'boolean':
        return value === true || value === 'true';
      case 'number':
        return value === '' || value === null || value === undefined ? null : Number(value);
      case 'multiselect':
        return Array.isArray(value) ? value : [];
      default:
        return value;
    }
  }

  private serializeValue(question: FlowQuestion, value: unknown): unknown {
    switch (question.fieldType) {
      case 'boolean':
        return value === true;
      case 'number':
        return value === '' || value === null || value === undefined ? null : Number(value);
      case 'select':
        return value === '' ? null : value;
      case 'multiselect':
        return Array.isArray(value) ? value : [];
      case 'date':
        return value || null;
      default:
        return value === '' ? null : value;
    }
  }

  private defaultValue(question: FlowQuestion): unknown {
    return question.fieldType === 'multiselect' ? [] : '';
  }

  private normalizeOption(item: unknown): { label: string; value: unknown; key: string } {
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const value = record.value ?? record.id ?? item;
      return {
        label: String(record.label ?? record.title ?? record.value ?? record.id ?? JSON.stringify(item)),
        value,
        key: this.optionKey(value),
      };
    }
    return {
      label: String(item),
      value: item,
      key: this.optionKey(item),
    };
  }

  optionValueFromKey(question: FlowQuestion, key: string): unknown {
    return this.questionOptions(question).find((option) => option.key === key)?.value ?? key;
  }

  optionKey(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  }
}
