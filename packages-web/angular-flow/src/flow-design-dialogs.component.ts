import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import type {
  FlowAgentRule,
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowNodeFormRule,
  FlowTransitionEffect,
} from './types';

@Component({
  selector: 'stynx-flow-graph-dialog',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ (graph?.id ? 'flow.dialog.graph.editTitle' : 'flow.dialog.graph.newTitle') | stynxTranslate }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="dismissed.emit()">{{ 'flow.common.cancel' | stynxTranslate }}</button>
          <button type="button" (click)="save.emit(graph || {})">{{ 'flow.common.save' | stynxTranslate }}</button>
        </footer>
      </section>
    }
  `,
  styles: [`
    .dialog {
      display: grid;
      gap: 1rem;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 1rem;
      background: var(--mat-sys-surface, #ffffff);
    }

    footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowGraphDialogComponent {
  @Input() open = false;
  @Input() graph: Partial<FlowGraph> | undefined;
  @Output() readonly save = new EventEmitter<Partial<FlowGraph>>();
  @Output() readonly dismissed = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-node-dialog',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ (node?.id ? 'flow.dialog.node.editTitle' : 'flow.dialog.node.newTitle') | stynxTranslate }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="dismissed.emit()">{{ 'flow.common.cancel' | stynxTranslate }}</button>
          <button type="button" (click)="save.emit(node || {})">{{ 'flow.common.save' | stynxTranslate }}</button>
        </footer>
      </section>
    }
  `,
  styles: [`.dialog { display: grid; gap: 1rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 1rem; } footer { display: flex; justify-content: flex-end; gap: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowNodeDialogComponent {
  @Input() open = false;
  @Input() node: Partial<FlowNode> | undefined;
  @Output() readonly save = new EventEmitter<Partial<FlowNode>>();
  @Output() readonly dismissed = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-edge-dialog',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ (edge?.id ? 'flow.dialog.edge.editTitle' : 'flow.dialog.edge.newTitle') | stynxTranslate }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="dismissed.emit()">{{ 'flow.common.cancel' | stynxTranslate }}</button>
          <button type="button" (click)="save.emit(edge || {})">{{ 'flow.common.save' | stynxTranslate }}</button>
        </footer>
      </section>
    }
  `,
  styles: [`.dialog { display: grid; gap: 1rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 1rem; } footer { display: flex; justify-content: flex-end; gap: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowEdgeDialogComponent {
  @Input() open = false;
  @Input() edge: Partial<FlowEdge> | undefined;
  @Output() readonly save = new EventEmitter<Partial<FlowEdge>>();
  @Output() readonly dismissed = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-agent-rule-dialog',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ 'flow.dialog.agentRule.title' | stynxTranslate }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="dismissed.emit()">{{ 'flow.common.cancel' | stynxTranslate }}</button>
          <button type="button" (click)="save.emit(rule || {})">{{ 'flow.common.save' | stynxTranslate }}</button>
        </footer>
      </section>
    }
  `,
  styles: [`.dialog { display: grid; gap: 1rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 1rem; } footer { display: flex; justify-content: flex-end; gap: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowAgentRuleDialogComponent {
  @Input() open = false;
  @Input() rule: Partial<FlowAgentRule> | undefined;
  @Output() readonly save = new EventEmitter<Partial<FlowAgentRule>>();
  @Output() readonly dismissed = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-node-form-rule-dialog',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ 'flow.dialog.formRule.title' | stynxTranslate }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="dismissed.emit()">{{ 'flow.common.cancel' | stynxTranslate }}</button>
          <button type="button" (click)="save.emit(rule || {})">{{ 'flow.common.save' | stynxTranslate }}</button>
        </footer>
      </section>
    }
  `,
  styles: [`.dialog { display: grid; gap: 1rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 1rem; } footer { display: flex; justify-content: flex-end; gap: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowNodeFormRuleDialogComponent {
  @Input() open = false;
  @Input() rule: Partial<FlowNodeFormRule> | undefined;
  @Output() readonly save = new EventEmitter<Partial<FlowNodeFormRule>>();
  @Output() readonly dismissed = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-transition-effect-dialog',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ 'flow.dialog.transitionEffect.title' | stynxTranslate }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="dismissed.emit()">{{ 'flow.common.cancel' | stynxTranslate }}</button>
          <button type="button" (click)="save.emit(effect || {})">{{ 'flow.common.save' | stynxTranslate }}</button>
        </footer>
      </section>
    }
  `,
  styles: [`.dialog { display: grid; gap: 1rem; border: 1px solid #d8dee9; border-radius: 8px; padding: 1rem; } footer { display: flex; justify-content: flex-end; gap: 0.75rem; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowTransitionEffectDialogComponent {
  @Input() open = false;
  @Input() effect: Partial<FlowTransitionEffect> | undefined;
  @Output() readonly save = new EventEmitter<Partial<FlowTransitionEffect>>();
  @Output() readonly dismissed = new EventEmitter<void>();
}
