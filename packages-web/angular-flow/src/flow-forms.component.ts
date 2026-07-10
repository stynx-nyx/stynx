import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { StynxHasPermissionDirective } from '@stynx-nyx/angular-auth';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { StynxBannerComponent, StynxIconComponent, StynxLoadingSpinnerComponent } from '@stynx-nyx/angular-ui';
import { FlowApiService } from './flow-api.service';
import type { FlowForm, FlowQuestion, FlowScore } from './types';

@Component({
  selector: 'stynx-flow-forms',
  standalone: true,
  imports: [StynxBannerComponent, StynxHasPermissionDirective, StynxIconComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ 'flow.forms.title' | stynxTranslate }}</h2>
        <button type="button" *stynxHasPermission="'flow:write:design'" (click)="create.emit()">
          <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
          {{ 'flow.forms.actions.create' | stynxTranslate }}
        </button>
      </header>
      @if (loading) {
        <stynx-loading-spinner [label]="'flow.forms.loading' | stynxTranslate"></stynx-loading-spinner>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
      <div class="list">
        @for (form of forms; track form.id) {
          <button type="button" class="item" (click)="selected.emit(form)">
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

    button {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }

    stynx-icon {
      --stynx-icon-size: 1rem;
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
  private readonly api = inject(FlowApiService);

  @Input() scopeId = '';
  @Output() readonly create = new EventEmitter<void>();
  @Output() readonly selected = new EventEmitter<FlowForm>();

  forms: FlowForm[] = [];
  loading = false;
  errorMessage = '';

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
  imports: [StynxHasPermissionDirective, StynxIconComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ form?.title || ('flow.formEditor.fallbackTitle' | stynxTranslate) }}</h2>
        <button type="button" *stynxHasPermission="'flow:write:design'" (click)="save.emit(form || {})">
          <stynx-icon name="save" aria-hidden="true"></stynx-icon>
          {{ 'flow.common.save' | stynxTranslate }}
        </button>
      </header>
      <div class="questions">
        @for (question of questions; track question.id) {
          <article class="question">
            <strong>{{ question.label }}</strong>
            <span>{{ question.key }} {{ question.fieldType }}</span>
            @if (question.required) {
              <small>{{ 'flow.common.required' | stynxTranslate }}</small>
            }
          </article>
        }
      </div>
    </section>
  `,
  styles: [`.surface, .questions { display: grid; gap: 0.75rem; } header { display: flex; justify-content: space-between; align-items: center; } h2 { margin: 0; } button { display: inline-flex; align-items: center; gap: 0.4rem; } stynx-icon { --stynx-icon-size: 1rem; } .question { border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; display: grid; gap: 0.25rem; }`],
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
  imports: [StynxIconComponent, StynxTranslatePipe],
  template: `
    <article class="score">
      <strong>{{ question?.label || ('flow.questionScore.fallbackTitle' | stynxTranslate) }}</strong>
      <span>{{ score?.passPoints || '1' }} / {{ score?.failPoints || '0' }}</span>
      <button type="button" (click)="save.emit(score || {})">
        <stynx-icon name="save" aria-hidden="true"></stynx-icon>
        {{ 'flow.questionScore.actions.save' | stynxTranslate }}
      </button>
    </article>
  `,
  styles: [`.score { display: grid; gap: 0.5rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; } button { display: inline-flex; align-items: center; gap: 0.4rem; justify-self: start; } stynx-icon { --stynx-icon-size: 1rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowQuestionScoreComponent {
  @Input() question: FlowQuestion | undefined;
  @Input() score: Partial<FlowScore> | undefined;
  @Output() readonly save = new EventEmitter<Partial<FlowScore>>();
}
