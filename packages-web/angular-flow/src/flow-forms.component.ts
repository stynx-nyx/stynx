import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Input, Output } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { StynxHasPermissionDirective } from '@stynx-web/angular-auth';
import { StynxBannerComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { FlowApiService } from './flow-api.service';
import type { FlowForm, FlowQuestion, FlowScore } from './types';

@Component({
  selector: 'stynx-flow-forms',
  standalone: true,
  imports: [StynxBannerComponent, StynxHasPermissionDirective, StynxLoadingSpinnerComponent],
  template: `
    <section class="surface">
      <header>
        <h2>Forms</h2>
        <button type="button" *stynxHasPermission="'flow:write:design'" (click)="create.emit()">New form</button>
      </header>
      @if (loading) {
        <stynx-loading-spinner label="Loading forms"></stynx-loading-spinner>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
      <div class="list">
        @for (form of forms; track form.id) {
          <button type="button" class="item" (click)="select.emit(form)">
            <strong>{{ form.title }}</strong>
            <span>{{ form.code }} {{ form.version }}</span>
          </button>
        }
      </div>
    </section>
  `,
  styles: [`
    .surface,
    .list,
    .item {
      display: grid;
      gap: 0.75rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    h2 {
      margin: 0;
    }

    .item {
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 0.75rem;
      text-align: left;
      background: var(--mat-sys-surface, #ffffff);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowFormsComponent implements OnChanges {
  @Input() scopeId = '';
  @Output() readonly create = new EventEmitter<void>();
  @Output() readonly select = new EventEmitter<FlowForm>();

  forms: FlowForm[] = [];
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
      this.forms = await this.api.listForms(this.scopeId || undefined);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Forms load failed';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'stynx-flow-form-editor',
  standalone: true,
  imports: [StynxHasPermissionDirective],
  template: `
    <section class="surface">
      <header>
        <h2>{{ form?.title || 'Form' }}</h2>
        <button type="button" *stynxHasPermission="'flow:write:design'" (click)="save.emit(form || {})">Save</button>
      </header>
      <div class="questions">
        @for (question of questions; track question.id) {
          <article class="question">
            <strong>{{ question.label }}</strong>
            <span>{{ question.key }} {{ question.fieldType }}</span>
            @if (question.required) {
              <small>Required</small>
            }
          </article>
        }
      </div>
    </section>
  `,
  styles: [`.surface, .questions { display: grid; gap: 0.75rem; } header { display: flex; justify-content: space-between; align-items: center; } h2 { margin: 0; } .question { border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; display: grid; gap: 0.25rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowFormEditorComponent {
  @Input() form: Partial<FlowForm> | undefined;
  @Input() questions: FlowQuestion[] = [];
  @Output() readonly save = new EventEmitter<Partial<FlowForm>>();
  @Output() readonly questionSelected = new EventEmitter<FlowQuestion>();
}

@Component({
  selector: 'stynx-flow-question-score',
  standalone: true,
  template: `
    <article class="score">
      <strong>{{ question?.label || 'Question score' }}</strong>
      <span>{{ score?.passPoints || '1' }} / {{ score?.failPoints || '0' }}</span>
      <button type="button" (click)="save.emit(score || {})">Save score</button>
    </article>
  `,
  styles: [`.score { display: grid; gap: 0.5rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowQuestionScoreComponent {
  @Input() question: FlowQuestion | undefined;
  @Input() score: Partial<FlowScore> | undefined;
  @Output() readonly save = new EventEmitter<Partial<FlowScore>>();
}
