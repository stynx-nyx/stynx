import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { StynxHasPermissionDirective } from '@stynx-web/angular-auth';
import { StynxBannerComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { FlowApiService } from './flow-api.service';
import { StynxFlowGraphCanvasComponent } from './flow-graph-canvas.component';
import type { FlowEdge, FlowGraph, FlowNode, FlowScope } from './types';

@Component({
  selector: 'stynx-flow-graph-designer',
  standalone: true,
  imports: [
    StynxBannerComponent,
    StynxFlowGraphCanvasComponent,
    StynxHasPermissionDirective,
    StynxLoadingSpinnerComponent,
  ],
  template: `
    <section class="stynx-flow-designer">
      <header>
        <div>
          <h2>{{ activeGraph?.name || activeGraph?.code || 'Flow graph' }}</h2>
          @if (activeScope) {
            <p>{{ activeScope.label }}</p>
          }
        </div>
        <button type="button" *stynxHasPermission="'flow:write:design'" (click)="createGraph.emit(activeScope)">
          New graph
        </button>
      </header>

      @if (loading) {
        <stynx-loading-spinner label="Loading flow"></stynx-loading-spinner>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }

      <stynx-flow-graph-canvas
        [nodes]="nodes"
        [edges]="edges"
        (nodeSelected)="nodeSelected.emit($event)"
        (edgeSelected)="edgeSelected.emit($event)"
      ></stynx-flow-graph-canvas>
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
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxFlowGraphDesignerComponent implements OnChanges {
  private readonly api = inject(FlowApiService);

  @Input() scopeId = '';
  @Input() graphId = '';
  @Output() readonly createGraph = new EventEmitter<FlowScope | undefined>();
  @Output() readonly nodeSelected = new EventEmitter<FlowNode>();
  @Output() readonly edgeSelected = new EventEmitter<FlowEdge>();

  scopes: FlowScope[] = [];
  graphs: FlowGraph[] = [];
  nodes: FlowNode[] = [];
  edges: FlowEdge[] = [];
  loading = false;
  errorMessage = '';

  get activeScope(): FlowScope | undefined {
    return this.scopes.find((scope) => scope.id === this.scopeId);
  }

  get activeGraph(): FlowGraph | undefined {
    return this.graphs.find((graph) => graph.id === this.graphId);
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
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Flow graph load failed';
    } finally {
      this.loading = false;
    }
  }
}
