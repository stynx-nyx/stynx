export interface TenantContextSnapshot {
  id: string;
  source: 'query' | 'subdomain' | 'default' | 'manual';
}

export interface TenantTransition {
  from: string | null;
  to: string | null;
  at: number;
}

export interface TenantResolutionContext {
  url: URL;
  host: string;
}

export interface TenancyOptions {
  defaultTenantResolver?: (context: TenantResolutionContext) => Promise<string | null> | string | null;
}

export interface TenantOption {
  id: string;
  label: string;
  description?: string;
}

export interface TenantPickerLabels {
  title: string;
  description: string;
  availableTenants: string;
}
