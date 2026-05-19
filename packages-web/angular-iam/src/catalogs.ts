import enCatalog from './i18n/en.json';
import ptBrCatalog from './i18n/pt-BR.json';

export type StynxIamCatalog = Record<string, string>;

export const STYNX_IAM_CATALOGS: Record<string, StynxIamCatalog> = {
  en: enCatalog,
  'en-US': enCatalog,
  'pt-BR': ptBrCatalog,
};
