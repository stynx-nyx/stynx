import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { StynxIconComponent } from '@stynx-nyx/angular-ui';
import type { FlowEdge, FlowNode } from './types';

@Component({
  selector: 'stynx-flow-graph-canvas',
  standalone: true,
  imports: [StynxIconComponent, StynxTranslatePipe],
  template: `
    <section class="stynx-flow-canvas" [attr.aria-label]="'flow.graphCanvas.ariaLabel' | stynxTranslate">
      <div class="nodes">
        @for (node of nodes; track node.id) {
          <button type="button" class="node" [attr.data-kind]="node.kind" (click)="nodeSelected.emit(node)">
            <strong>{{ node.code }}</strong>
            @if (node.name) {
              <span>{{ node.name }}</span>
            }
          </button>
        }
      </div>
      <div class="edges">
        @for (edge of edges; track edge.id) {
          <button type="button" class="edge" (click)="edgeSelected.emit(edge)">
            <span>{{ edge.fromNodeCode || edge.fromNodeId }}</span>
            <span class="edge-action">
              <span>{{ edge.action || ('flow.graphCanvas.defaultAction' | stynxTranslate) }}</span>
              <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
            </span>
            <span>{{ edge.toNodeCode || edge.toNodeId }}</span>
          </button>
        }
      </div>
    </section>
  `,
  styles: [`
    .stynx-flow-canvas {
      display: grid;
      gap: 1rem;
      min-height: 18rem;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 1rem;
      background: var(--mat-sys-surface, #ffffff);
    }

    .nodes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: 0.75rem;
      align-content: start;
    }

    .node,
    .edge {
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      background: var(--mat-sys-surface-container-lowest, #ffffff);
      color: var(--mat-sys-on-surface, #17202a);
      border-radius: 8px;
      padding: 0.75rem;
      text-align: left;
      display: grid;
      gap: 0.25rem;
      min-height: 4rem;
    }

    .node[data-kind='start'],
    .node[data-kind='end'] {
      border-color: var(--mat-sys-primary, #2563eb);
    }

    .node[data-kind='human'] {
      border-color: var(--mat-sys-tertiary, #047857);
    }

    .edges {
      display: grid;
      gap: 0.5rem;
    }

    .edge {
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      min-height: 2.75rem;
    }

    .edge-action {
      display: inline-flex;
      gap: 0.35rem;
      align-items: center;
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    stynx-icon {
      --stynx-icon-size: 0.95rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowGraphCanvasComponent {
  @Input() nodes: FlowNode[] = [];
  @Input() edges: FlowEdge[] = [];
  @Output() readonly nodeSelected = new EventEmitter<FlowNode>();
  @Output() readonly edgeSelected = new EventEmitter<FlowEdge>();
}
