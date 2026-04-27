export interface TenantContextSnapshot {
  id: string;
  source: 'query' | 'subdomain' | 'default' | 'manual';
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
}
