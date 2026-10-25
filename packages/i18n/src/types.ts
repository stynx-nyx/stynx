/** A JSON value retained in tenant override settings; not necessarily an ICU message. */
export type I18nOverrideValue =
  string | number | boolean | null | I18nOverrideValue[] | { [key: string]: I18nOverrideValue };

/** Prefixed tenant override entries, preserving their stored JSON values. */
export type I18nTenantOverrides = Record<string, I18nOverrideValue>;

/** Messages for one locale, keyed by message key (ICU MessageFormat values). */
export type I18nCatalogMessages = Record<string, string>;

export interface StynxI18nModuleOptions {
  /**
   * Opt-in scan of `<workspaceRoot>/packages/<name>/i18n/<locale>.json` (and `packages-web`).
   * When omitted no filesystem scan happens; catalogs come from `catalogs` and
   * {@link CatalogService.registerCatalog}.
   */
  workspaceRoot?: string;
  /** Default locale; `en-US` unless configured (for example `pt-BR`). */
  defaultLocale?: string;
  supportedLocales?: string[];
  /** Catalogs registered at boot, keyed by locale. */
  catalogs?: Record<string, I18nCatalogMessages>;
}

export interface TenantOverrideUpdateInput {
  locale: string;
  catalog: Record<string, string>;
}
