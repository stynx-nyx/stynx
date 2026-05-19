import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { StynxHasPermissionDirective } from '@stynx-web/angular-auth';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxBannerComponent, StynxIconComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { FlowApiService } from './flow-api.service';
import type { FlowWaiver } from './types';

@Component({
  selector: 'stynx-flow-waivers',
  standalone: true,
  imports: [StynxBannerComponent, StynxHasPermissionDirective, StynxIconComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="surface">
      <header>
        <h2>{{ 'flow.waivers.title' | stynxTranslate }}</h2>
        <button type="button" *stynxHasPermission="'flow:execute:task'" (click)="create.emit()">
          <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
          {{ 'flow.waivers.actions.create' | stynxTranslate }}
        </button>
      </header>
      @if (loading) {
        <stynx-loading-spinner [label]="'flow.waivers.loading' | stynxTranslate"></stynx-loading-spinner>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
      @for (waiver of waivers; track waiver.id) {
        <button type="button" class="item" (click)="selected.emit(waiver)">
          <strong>{{ waiver.reason }}</strong>
          <span>{{ waiver.targetType }} {{ waiver.targetId }}</span>
        </button>
      }
    </section>
  `,
  styles: [`.surface { display: grid; gap: 0.75rem; } header { display: flex; justify-content: space-between; align-items: center; } h2 { margin: 0; } button { display: inline-flex; align-items: center; gap: 0.4rem; } stynx-icon { --stynx-icon-size: 1rem; } .item { display: grid; gap: 0.25rem; text-align: left; border: 1px solid #d8dee9; border-radius: 8px; padding: 0.75rem; background: #ffffff; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowWaiversComponent implements OnChanges {
  private readonly api = inject(FlowApiService);

  @Input() scopeId = '';
  @Input() targetType = '';
  @Input() targetId = '';
  @Output() readonly create = new EventEmitter<void>();
  @Output() readonly selected = new EventEmitter<FlowWaiver>();

  waivers: FlowWaiver[] = [];
  loading = false;
  errorMessage = '';

  async ngOnChanges(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      const filters: { scopeId?: string; targetType?: string; targetId?: string } = {};
      if (this.scopeId) {
        filters.scopeId = this.scopeId;
      }
      if (this.targetType) {
        filters.targetType = this.targetType;
      }
      if (this.targetId) {
        filters.targetId = this.targetId;
      }
      this.waivers = await this.api.listWaivers(filters);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Waivers load failed';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'stynx-flow-waiver-dialog',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ (waiver?.id ? 'flow.waiverDialog.editTitle' : 'flow.waiverDialog.newTitle') | stynxTranslate }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="dismissed.emit()">{{ 'flow.common.cancel' | stynxTranslate }}</button>
          <button type="button" (click)="save.emit(waiver || {})">{{ 'flow.common.save' | stynxTranslate }}</button>
        </footer>
      </section>
    }
  `,
  styles: [`.dialog { display: grid; gap: 1rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 1rem; } footer { display: flex; justify-content: flex-end; gap: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowWaiverDialogComponent {
  @Input() open = false;
  @Input() waiver: Partial<FlowWaiver> | undefined;
  @Output() readonly save = new EventEmitter<Partial<FlowWaiver>>();
  @Output() readonly dismissed = new EventEmitter<void>();
}
