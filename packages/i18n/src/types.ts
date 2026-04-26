export interface StynxI18nModuleOptions {
  workspaceRoot?: string;
  defaultLocale?: string;
  supportedLocales?: string[];
}

export interface TenantOverrideUpdateInput {
  locale: string;
  catalog: Record<string, string>;
}
