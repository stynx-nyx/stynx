import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { StynxHasPermissionDirective } from '@stynx-nyx/angular-auth';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { StynxDocumentUploadComponent } from '@stynx-nyx/angular-storage';
import type { StynxDocumentUploadCompletedEvent } from '@stynx-nyx/angular-storage';
import { StynxBannerComponent, StynxIconComponent, StynxLoadingSpinnerComponent } from '@stynx-nyx/angular-ui';
import { FlowApiService } from './flow-api.service';
import type { FlowAnswer, FlowFill, FlowQuestion } from './types';

@Component({
  selector: 'stynx-flow-fills',
  standalone: true,
  imports: [StynxBannerComponent, StynxHasPermissionDirective, StynxIconComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ 'flow.fills.title' | stynxTranslate }}</h2>
        <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="create.emit()">
          <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
          {{ 'flow.fills.actions.create' | stynxTranslate }}
        </button>
      </header>
      @if (loading) {
        <stynx-loading-spinner [label]="'flow.fills.loading' | stynxTranslate"></stynx-loading-spinner>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
      @for (fill of fills; track fill.id) {
        <button type="button" class="item" (click)="selected.emit(fill)">
          <strong>{{ fill.targetType }} {{ fill.targetId }}</strong>
          <span>{{ fill.status }}</span>
        </button>
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } header { display: flex; justify-content: space-between; align-items: center; } h2 { margin: 0; } button { display: inline-flex; align-items: center; gap: 0.4rem; } stynx-icon { --stynx-icon-size: 1rem; } .item { border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; text-align: left; background: #ffffff; display: grid; gap: 0.25rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowFillsComponent implements OnChanges {
  private readonly api = inject(FlowApiService);

  @Input() formId = '';
  @Input() targetType = '';
  @Input() targetId = '';
  @Output() readonly create = new EventEmitter<void>();
  @Output() readonly selected = new EventEmitter<FlowFill>();

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
  imports: [StynxDocumentUploadComponent, StynxHasPermissionDirective, StynxIconComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ fill?.targetId || ('flow.fillEditor.fallbackTitle' | stynxTranslate) }}</h2>
        <div class="actions">
          <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="saveAllAnswers()">
            <stynx-icon name="save" aria-hidden="true"></stynx-icon>
            {{ 'flow.fillEditor.actions.saveAnswers' | stynxTranslate }}
          </button>
          <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="submitted.emit(fill || {})">
            {{ 'flow.fillEditor.actions.submit' | stynxTranslate }}
          </button>
        </div>
      </header>
      @for (question of questions; track question.id) {
        @if (isQuestionVisible(question)) {
        <article class="answer">
          <label [attr.for]="'flow-answer-' + question.id">
            <strong>{{ question.label }}</strong>
            @if (question.required) {
              <small>{{ 'flow.common.required' | stynxTranslate }}</small>
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
              @if (isLongText(question)) {
                <textarea
                  [id]="'flow-answer-' + question.id"
                  [attr.maxlength]="questionTextMaxLength(question)"
                  [value]="textValue(question)"
                  (input)="setValue(question, $any($event.target).value)"
                ></textarea>
              } @else {
                <input
                  [id]="'flow-answer-' + question.id"
                  type="text"
                  [attr.maxlength]="questionTextMaxLength(question)"
                  [value]="textValue(question)"
                  (input)="setValue(question, $any($event.target).value)"
                />
              }
              <small>{{ 'flow.fillEditor.characterCount' | stynxTranslate: { count: textValue(question).length } }}</small>
            }
            @case ('file') {
              <stynx-document-upload
                [collection]="fileCollection(question)"
                [enableDragAndDrop]="true"
                (completed)="setFileAnswer(question, $event)"
              ></stynx-document-upload>
              @if (textValue(question)) {
                <small>{{ 'flow.fillEditor.fileSelected' | stynxTranslate: { id: textValue(question) } }}</small>
              }
            }
            @case ('signature') {
              <div class="signature">
                <canvas
                  [attr.aria-label]="'flow.fillEditor.signatureCanvas' | stynxTranslate"
                  width="560"
                  height="160"
                  (pointerdown)="beginSignature(question, $event)"
                  (pointermove)="drawSignature(question, $event)"
                  (pointerup)="endSignature(question, $event)"
                  (pointerleave)="endSignature(question, $event)"
                ></canvas>
                <button type="button" class="secondary" (click)="clearSignature(question, $event)">
                  {{ 'flow.fillEditor.actions.clearSignature' | stynxTranslate }}
                </button>
              </div>
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
            {{ 'flow.fillEditor.actions.waive' | stynxTranslate }}
          </button>
        </article>
        }
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; } h2 { margin: 0; } .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; } button { display: inline-flex; align-items: center; gap: 0.4rem; } stynx-icon { --stynx-icon-size: 1rem; } .answer { border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; display: grid; gap: 0.5rem; } label { display: flex; gap: 0.5rem; align-items: baseline; justify-content: space-between; } input:not([type="checkbox"]), select, textarea { width: 100%; box-sizing: border-box; border: 1px solid #c7d0dd; border-radius: 6px; padding: 0.5rem; } textarea { min-height: 6rem; resize: vertical; } small { color: #64748b; } .signature { display: grid; gap: 0.5rem; } canvas { width: 100%; max-width: 35rem; height: 10rem; border: 1px solid #c7d0dd; border-radius: 6px; touch-action: none; background: #ffffff; } .secondary { justify-self: start; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowFillEditorComponent implements OnChanges {
  @Input() fill: Partial<FlowFill> | undefined;
  @Input() questions: FlowQuestion[] = [];
  @Input() answers: FlowAnswer[] = [];
  @Output() readonly submitted = new EventEmitter<Partial<FlowFill>>();
  @Output() readonly answer = new EventEmitter<Partial<FlowAnswer>>();
  @Output() readonly saveAnswers = new EventEmitter<Array<Partial<FlowAnswer>>>();
  @Output() readonly waiveQuestion = new EventEmitter<FlowQuestion>();

  private readonly values = new Map<string, unknown>();
  private readonly drawingQuestions = new Set<string>();

  ngOnChanges(): void {
    this.values.clear();
    this.drawingQuestions.clear();
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

  isQuestionVisible(question: FlowQuestion): boolean {
    const condition = question.revealIf ?? this.revealIfFromVisibleIf(question.visibleIf);
    if (!condition) {
      return true;
    }
    const source = this.questions.find((item) => item.key === condition.question || item.id === condition.question);
    if (!source) {
      return false;
    }
    return this.optionKey(this.valueFor(source)) === this.optionKey(condition.equals);
  }

  isLongText(question: FlowQuestion): boolean {
    const mode = this.textMode(question);
    return mode === 'long' || this.questionTextMaxLength(question) > 200;
  }

  questionTextMaxLength(question: FlowQuestion): number {
    const maxLength = Number(question.validators?.maxLength ?? question.validators?.maxlength);
    if (Number.isFinite(maxLength) && maxLength > 0) {
      return Math.min(maxLength, 4000);
    }
    return this.textMode(question) === 'long' ? 4000 : 200;
  }

  setValue(question: FlowQuestion, value: unknown): void {
    const parsed = this.parseInputValue(question, value);
    this.values.set(question.id, parsed);
    this.answer.emit({
      questionId: question.id,
      value: this.serializeValue(question, parsed),
    });
  }

  setFileAnswer(question: FlowQuestion, event: StynxDocumentUploadCompletedEvent): void {
    this.setValue(question, event.id);
  }

  fileCollection(question: FlowQuestion): string {
    const collection = question.validators?.collection ?? this.questionOptionRecord(question)?.collection;
    return typeof collection === 'string' && collection.length > 0 ? collection : 'flow';
  }

  beginSignature(question: FlowQuestion, event: PointerEvent): void {
    this.drawingQuestions.add(question.id);
    this.drawSignaturePoint(event, true);
  }

  drawSignature(question: FlowQuestion, event: PointerEvent): void {
    if (!this.drawingQuestions.has(question.id)) {
      return;
    }
    this.drawSignaturePoint(event, false);
  }

  endSignature(question: FlowQuestion, event: PointerEvent): void {
    if (!this.drawingQuestions.delete(question.id)) {
      return;
    }
    const canvas = event.target instanceof HTMLCanvasElement ? event.target : undefined;
    if (canvas) {
      this.setValue(question, canvas.toDataURL('image/png'));
    }
  }

  clearSignature(question: FlowQuestion, event: Event): void {
    const canvas = (event.target as HTMLElement | null)?.closest('.signature')?.querySelector('canvas');
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.setValue(question, '');
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
    this.saveAnswers.emit(this.questions.filter((question) => this.isQuestionVisible(question)).map((question) => ({
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
      case 'file':
      case 'signature':
        return value ?? '';
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
        return value;
      case 'date':
        return value || null;
      case 'file':
      case 'signature':
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

  private revealIfFromVisibleIf(value: Record<string, unknown> | undefined): { question: string; equals: unknown } | undefined {
    const question = value?.question ?? value?.key ?? value?.questionKey;
    if (typeof question !== 'string') {
      return undefined;
    }
    return {
      question,
      equals: value?.equals ?? value?.value,
    };
  }

  private textMode(question: FlowQuestion): 'short' | 'long' {
    const optionRecord = this.questionOptionRecord(question);
    const mode = question.validators?.mode ?? question.validators?.variant ?? optionRecord?.mode;
    return mode === 'long' ? 'long' : 'short';
  }

  private questionOptionRecord(question: FlowQuestion): Record<string, unknown> | undefined {
    return question.options && !Array.isArray(question.options) ? question.options : undefined;
  }

  private drawSignaturePoint(event: PointerEvent, begin: boolean): void {
    const canvas = event.target instanceof HTMLCanvasElement ? event.target : undefined;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#0f172a';
    if (begin) {
      context.beginPath();
      context.moveTo(x, y);
      return;
    }
    context.lineTo(x, y);
    context.stroke();
  }
}
