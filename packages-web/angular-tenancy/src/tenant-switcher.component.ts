import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { TenantContextService } from './tenant-context.service';
import type { TenantOption } from './types';

@Component({
  selector: 'stynx-tenant-switcher',
  standalone: true,
  imports: [CommonModule, StynxTranslatePipe],
  template: `
    <label>
      <span>{{ 'tenancy.switcher.label' | stynxTranslate }}</span>
      <select [value]="tenantContext.tenantId() ?? ''" (change)="selectTenant($event)">
        <option value="" disabled>{{ 'tenancy.switcher.placeholder' | stynxTranslate }}</option>
        @for (tenant of tenants; track tenant.id) {
          <option [value]="tenant.id">{{ tenant.label }}</option>
        }
      </select>
    </label>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantSwitcherComponent {
  @Input({ required: true }) tenants: TenantOption[] = [];
  @Output() readonly tenantChange = new EventEmitter<string>();
  readonly tenantContext = inject(TenantContextService);

  selectTenant(event: Event): void {
    const tenantId = (event.target as HTMLSelectElement).value;
    if (!tenantId) {
      return;
    }
    this.tenantContext.setTenant(tenantId, 'manual');
    this.tenantChange.emit(tenantId);
  }
}
