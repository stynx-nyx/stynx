import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { StynxHasPermissionDirective } from '@stynx-web/angular-auth';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxBannerComponent, StynxIconComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { FlowApiService } from './flow-api.service';
import { StynxFlowEmptyStateComponent } from './flow-empty-state.component';
import { StynxFlowGraphCanvasComponent } from './flow-graph-canvas.component';
import type { FlowEdge, FlowGraph, FlowNode, FlowScope } from './types';

@Component({
  selector: 'stynx-flow-graph-designer',
  standalone: true,
  imports: [
    StynxBannerComponent,
    StynxFlowEmptyStateComponent,
    StynxFlowGraphCanvasComponent,
    StynxHasPermissionDirective,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-flow-designer">
      @if (loading) {
        <stynx-loading-spinner [label]="'flow.graphDesigner.loading' | stynxTranslate"></stynx-loading-spinner>
      } @else if (hasNoScopes) {
        <stynx-flow-empty-state
          [heading]="'flow.graphDesigner.emptyScopes.title' | stynxTranslate"
          [message]="'flow.graphDesigner.emptyScopes.message' | stynxTranslate"
          [actionLabel]="'flow.graphDesigner.emptyScopes.action' | stynxTranslate"
          actionPermission="flow:write:design"
          iconName="form"
          (action)="createScope.emit()"
        ></stynx-flow-empty-state>
      } @else {
        <header>
          <div>
            <h2>{{ activeGraph?.name || activeGraph?.code || ('flow.graphDesigner.fallbackTitle' | stynxTranslate) }}</h2>
            @if (activeScope) {
              <p>{{ activeScope.label }}</p>
            }
            @if (activeGraph) {
              <span class="status-badge" [attr.data-status]="activeGraph.status">
                {{ graphStatusLabel(activeGraph) | stynxTranslate }}
                @if (activeGraph.status === 'published' && activeGraph.publishedVersion) {
                  {{ activeGraph.publishedVersion }}
                }
              </span>
            }
          </div>
          <div class="actions">
            @if (activeGraph) {
              <button
                type="button"
                *stynxHasPermission="'flow:publish:design'"
                [disabled]="publishingGraphId === activeGraph.id"
                (click)="publishActiveGraph()"
              >
                <stynx-icon name="check" aria-hidden="true"></stynx-icon>
                {{ 'flow.graphDesigner.actions.publish' | stynxTranslate }}
              </button>
            }
            <button type="button" *stynxHasPermission="'flow:write:design'" (click)="createGraph.emit(activeScope)">
              <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
              {{ 'flow.graphDesigner.actions.newGraph' | stynxTranslate }}
            </button>
          </div>
        </header>

        @if (hasNoGraphsForActiveScope) {
          <stynx-flow-empty-state
            [heading]="'flow.graphDesigner.emptyGraphs.title' | stynxTranslate"
            [message]="'flow.graphDesigner.emptyGraphs.message' | stynxTranslate"
            [actionLabel]="'flow.graphDesigner.emptyGraphs.action' | stynxTranslate"
            actionPermission="flow:write:design"
            iconName="form"
            (action)="createGraph.emit(activeScope)"
          ></stynx-flow-empty-state>
        } @else {
          <stynx-flow-graph-canvas
            [nodes]="nodes"
            [edges]="edges"
            (nodeSelected)="nodeSelected.emit($event)"
            (edgeSelected)="edgeSelected.emit($event)"
          ></stynx-flow-graph-canvas>
        }
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
    </section>
  `,
  styles: [`
    .stynx-flow-designer {
      display: grid;
      gap: 1rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
    }

    h2,
    p {
      margin: 0;
    }

    p {
      color: var(--mat-sys-on-surface-variant, #5d6673);
    }

    button {
      min-height: 2.5rem;
      border-radius: 8px;
      padding: 0 1rem;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.65;
    }

    .actions {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .status-badge {
      display: inline-flex;
      width: fit-content;
      margin-top: 0.5rem;
      border-radius: 999px;
      padding: 0.2rem 0.55rem;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      color: var(--mat-sys-on-surface-variant, #475569);
      font-size: 0.8125rem;
      line-height: 1.2;
    }

    .status-badge[data-status='published'] {
      border-color: var(--mat-sys-primary, #2563eb);
      color: var(--mat-sys-primary, #2563eb);
    }

    stynx-icon {
      --stynx-icon-size: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowGraphDesignerComponent implements OnChanges {
  private readonly api = inject(FlowApiService);

  @Input() scopeId = '';
  @Input() graphId = '';
  @Output() readonly createScope = new EventEmitter<void>();
  @Output() readonly createGraph = new EventEmitter<FlowScope | undefined>();
  @Output() readonly nodeSelected = new EventEmitter<FlowNode>();
  @Output() readonly edgeSelected = new EventEmitter<FlowEdge>();

  scopes: FlowScope[] = [];
  graphs: FlowGraph[] = [];
  nodes: FlowNode[] = [];
  edges: FlowEdge[] = [];
  loading = false;
  publishingGraphId = '';
  errorMessage = '';

  get activeScope(): FlowScope | undefined {
    return this.scopes.find((scope) => scope.id === this.scopeId);
  }

  get activeGraph(): FlowGraph | undefined {
    return this.graphs.find((graph) => graph.id === this.graphId);
  }

  get hasNoScopes(): boolean {
    return this.scopes.length === 0;
  }

  get hasNoGraphsForActiveScope(): boolean {
    return this.activeScope !== undefined && this.graphs.length === 0;
  }

  async ngOnChanges(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.scopes = await this.api.listScopes();
      this.graphs = this.scopeId ? await this.api.listGraphs(this.scopeId) : [];
      if (this.graphId) {
        const [nodes, edges] = await Promise.all([
          this.api.listGraphNodes(this.graphId),
          this.api.listGraphEdges(this.graphId),
        ]);
        this.nodes = nodes;
        this.edges = edges;
      } else {
        this.nodes = [];
        this.edges = [];
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Flow graph load failed';
    } finally {
      this.loading = false;
    }
  }

  graphStatusLabel(graph: FlowGraph): string {
    return graph.status === 'published' && graph.publishedVersion
      ? 'flow.graphDesigner.status.published'
      : 'flow.graphDesigner.status.draft';
  }

  async publishActiveGraph(): Promise<void> {
    const graph = this.activeGraph;
    if (!graph) {
      return;
    }
    this.publishingGraphId = graph.id;
    this.errorMessage = '';
    try {
      await this.api.publishGraph(graph.id, { expectedDraftVersion: graph.version });
      await this.load();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Flow graph publish failed';
    } finally {
      this.publishingGraphId = '';
    }
  }
}
