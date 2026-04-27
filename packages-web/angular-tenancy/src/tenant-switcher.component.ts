import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TenantContextService } from './tenant-context.service';
import type { TenantOption } from './types';

@Component({
  selector: 'stynx-tenant-switcher',
  standalone: true,
  imports: [CommonModule],
  template: `
    <label>
      <span>Tenant</span>
      <select [value]="tenantContext.tenantId() ?? ''" (change)="selectTenant($event)">
        <option value="" disabled>Select tenant</option>
        <option *ngFor="let tenant of tenants" [value]="tenant.id">{{ tenant.label }}</option>
      </select>
    </label>
  `,
})
export class TenantSwitcherComponent {
  @Input({ required: true }) tenants: TenantOption[] = [];
  @Output() readonly tenantChange = new EventEmitter<string>();

  constructor(readonly tenantContext: TenantContextService) {}

  selectTenant(event: Event): void {
    const tenantId = (event.target as HTMLSelectElement).value;
    if (!tenantId) {
      return;
    }
    this.tenantContext.setTenant(tenantId, 'manual');
    this.tenantChange.emit(tenantId);
  }
}
