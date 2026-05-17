import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
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
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ graph?.id ? 'Edit graph' : 'New graph' }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="cancel.emit()">Cancel</button>
          <button type="button" (click)="save.emit(graph || {})">Save</button>
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
  @Output() readonly cancel = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-node-dialog',
  standalone: true,
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ node?.id ? 'Edit node' : 'New node' }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="cancel.emit()">Cancel</button>
          <button type="button" (click)="save.emit(node || {})">Save</button>
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
  @Output() readonly cancel = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-edge-dialog',
  standalone: true,
  template: `
    @if (open) {
      <section class="dialog">
        <h3>{{ edge?.id ? 'Edit edge' : 'New edge' }}</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="cancel.emit()">Cancel</button>
          <button type="button" (click)="save.emit(edge || {})">Save</button>
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
  @Output() readonly cancel = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-agent-rule-dialog',
  standalone: true,
  template: `
    @if (open) {
      <section class="dialog">
        <h3>Agent rule</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="cancel.emit()">Cancel</button>
          <button type="button" (click)="save.emit(rule || {})">Save</button>
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
  @Output() readonly cancel = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-node-form-rule-dialog',
  standalone: true,
  template: `
    @if (open) {
      <section class="dialog">
        <h3>Form rule</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="cancel.emit()">Cancel</button>
          <button type="button" (click)="save.emit(rule || {})">Save</button>
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
  @Output() readonly cancel = new EventEmitter<void>();
}

@Component({
  selector: 'stynx-flow-transition-effect-dialog',
  standalone: true,
  template: `
    @if (open) {
      <section class="dialog">
        <h3>Transition effect</h3>
        <ng-content></ng-content>
        <footer>
          <button type="button" (click)="cancel.emit()">Cancel</button>
          <button type="button" (click)="save.emit(effect || {})">Save</button>
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
  @Output() readonly cancel = new EventEmitter<void>();
}
