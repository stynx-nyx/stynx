import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TenantContextService } from '@stynx-web/angular-tenancy';
import { StynxSessionService } from '@stynx-web/angular-auth';
import { ReferenceWebApiService } from './reference-web-api.service';
import { ReferenceWebDevOidcAdapter } from './reference-web-dev-oidc.adapter';
import type { DemoTenant } from './reference-models';

@Injectable()
export class ReferenceWebShellService {
  private readonly tenantsState = signal<DemoTenant[]>([]);
  readonly tenants = computed(() => this.tenantsState());
  private readonly api = inject(ReferenceWebApiService);
  private readonly router = inject(Router);
  private readonly session = inject(StynxSessionService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly devOidc = inject(ReferenceWebDevOidcAdapter);

  async initialize(): Promise<void> {
    const tenants = await this.api.listDemoTenants();
    this.tenantsState.set(tenants);

    if (!this.session.snapshot().active && this.devOidc.currentEmail()) {
      const fallbackTenantId = this.tenantContext.tenantId() ?? tenants[0]?.id;
      if (fallbackTenantId) {
        this.tenantContext.setTenant(fallbackTenantId, 'manual');
        await this.session.completeLogin(`${window.location.origin}/login?tenantId=${fallbackTenantId}`);
      }
    }
  }

  async login(email: string, tenantId: string): Promise<void> {
    this.devOidc.beginLogin(email);
    this.tenantContext.setTenant(tenantId, 'manual');
    try {
      await this.session.completeLogin(`${window.location.origin}/login?tenantId=${tenantId}`);
    } catch (error) {
      this.devOidc.clear();
      this.tenantContext.clear();
      throw error;
    }
    await this.router.navigate(['/']);
  }

  async switchTenant(tenantId: string): Promise<void> {
    await this.session.switchTenant(tenantId);
    await this.router.navigate(['/']);
  }

  async logout(): Promise<void> {
    await this.session.logout();
    this.tenantContext.clear();
    await this.router.navigate(['/login']);
  }

  activeTenantLabel(): string {
    const tenantId = this.tenantContext.tenantId() ?? this.session.snapshot().tenantId;
    if (!tenantId) {
      return 'not selected';
    }
    return this.tenantsState().find((tenant) => tenant.id === tenantId)?.name ?? tenantId;
  }

  activeUserLabel(): string {
    return this.devOidc.currentEmail() ?? 'guest';
  }
}
