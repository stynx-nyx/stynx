import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StynxBannerComponent } from '@stynx-web/angular-ui';
import { ReferenceWebShellService } from '../core/reference-web-shell.service';

@Component({
  selector: 'stynx-reference-tenant-page',
  standalone: true,
  imports: [NgFor, StynxBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2 data-testid="tenant-selection-title">Tenant selection</h2>
          <p>Switch the active tenant and force a new STYNX session bundle.</p>
        </div>
        <stynx-banner
          tone="info"
          [message]="'Current: ' + shell.activeTenantLabel()"
          data-testid="tenant-current-banner"
        ></stynx-banner>
      </div>

      <div class="tenant-grid">
        @for (tenant of shell.tenants(); track tenant.id) {
          <article class="tenant-card" [attr.data-testid]="'tenant-card-' + tenant.id">
            <strong>{{ tenant.name }}</strong>
            <span>{{ tenant.slug }}</span>
            <button
              type="button"
              (click)="switchTenant(tenant.id)"
              [disabled]="pendingTenantId === tenant.id"
              [attr.data-testid]="'tenant-switch-' + tenant.id"
            >
              {{ pendingTenantId === tenant.id ? 'Switching...' : 'Use tenant' }}
            </button>
          </article>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .panel,
      .tenant-card {
        border: 1px solid var(--app-line);
        background: var(--app-card);
      }

      .panel {
        padding: 1.5rem;
        border-radius: 24px;
        display: grid;
        gap: 1rem;
      }

      .panel__header {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }

      .tenant-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
      }

      .tenant-card {
        border-radius: 18px;
        padding: 1rem;
        display: grid;
        gap: 0.6rem;
      }
    `,
  ],
})
export class TenantSelectionPageComponent {
  protected readonly shell = inject(ReferenceWebShellService);
  protected pendingTenantId: string | null = null;

  async switchTenant(tenantId: string): Promise<void> {
    this.pendingTenantId = tenantId;
    try {
      await this.shell.switchTenant(tenantId);
    } finally {
      this.pendingTenantId = null;
    }
  }
}
