export type StynxCatalog = Record<string, string>;

export interface StynxI18nModuleOptions {
  defaultLocale: string;
  supportedLocales?: string[];
  loadCatalog(locale: string): Promise<StynxCatalog>;
}
