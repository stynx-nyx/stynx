import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { TenantContextService } from './tenant-context.service';
import type { TenantOption, TenantPickerLabels } from './types';

const DEFAULT_TENANT_PICKER_LABELS: TenantPickerLabels = {
  title: 'Choose a tenant',
  description: 'Select the tenant workspace to continue.',
  availableTenants: 'Available tenants',
};

@Component({
  selector: 'stynx-tenant-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (shouldRenderPicker()) {
      <section class="stynx-tenant-picker" aria-labelledby="stynx-tenant-picker-title">
        <header class="stynx-tenant-picker__header">
          <h1 id="stynx-tenant-picker-title">{{ resolvedLabels().title }}</h1>
          <p>{{ resolvedLabels().description }}</p>
        </header>

        <div class="stynx-tenant-picker__options" role="list" [attr.aria-label]="resolvedLabels().availableTenants">
          @for (tenant of availableTenants(); track tenant.id) {
            <button
              class="stynx-tenant-picker__option"
              type="button"
              role="listitem"
              [class.stynx-tenant-picker__option--selected]="selectedTenantId() === tenant.id"
              [attr.aria-pressed]="selectedTenantId() === tenant.id"
              (click)="selectTenant(tenant)"
            >
              <span class="stynx-tenant-picker__option-label">{{ tenant.label }}</span>
              @if (tenant.description) {
                <span class="stynx-tenant-picker__option-description">{{ tenant.description }}</span>
              }
            </button>
          }
        </div>
      </section>
    } @else {
      <ng-content />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxTenantPickerComponent {
  private readonly tenantOptionsState = signal<readonly TenantOption[] | null>(null);
  private readonly labelsState = signal<Partial<TenantPickerLabels>>({});

  @Input() set tenants(value: readonly TenantOption[] | null | undefined) {
    this.tenantOptionsState.set(value ?? null);
  }

  @Input() set labels(value: Partial<TenantPickerLabels> | null | undefined) {
    this.labelsState.set(value ?? {});
  }

  @Output() readonly tenantChange = new EventEmitter<string>();
  readonly tenantContext = inject(TenantContextService);
  readonly selectedTenantId = signal<string | null>(null);
  readonly availableTenants = computed(() => this.tenantOptionsState() ?? this.tenantContext.availableTenants());
  readonly resolvedLabels = computed(() => ({ ...DEFAULT_TENANT_PICKER_LABELS, ...this.labelsState() }));
  readonly shouldRenderPicker = computed(() => this.availableTenants().length > 1 && !this.tenantContext.tenantId());

  selectTenant(tenant: TenantOption): void {
    this.selectedTenantId.set(tenant.id);
    this.tenantContext.setTenant(tenant.id, 'manual');
    this.tenantChange.emit(tenant.id);
  }
}
