import { Injectable, inject } from '@angular/core';
import { STYNX_IAM_CATALOGS } from '@stynx-web/angular-iam';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import flowEnCatalog from '../../../../../packages-web/angular-flow/src/i18n/en.json';
import flowPtBrCatalog from '../../../../../packages-web/angular-flow/src/i18n/pt-BR.json';

type Catalog = Record<string, string>;

const REFERENCE_CATALOGS: Record<string, Catalog> = {
  'en-US': {
    'app.title': 'Reference workflow cockpit',
    'dashboard.title': 'Operational overview',
    'records.title': 'Records',
    'work-items.title': 'Work items',
    'trash.title': 'Trash',
  },
  'pt-BR': {
    'app.title': 'Cockpit do fluxo de referencia',
    'dashboard.title': 'Visao operacional',
    'records.title': 'Registros',
    'work-items.title': 'Itens de trabalho',
    'trash.title': 'Lixeira',
  },
};

const FLOW_CATALOGS: Record<string, Catalog> = {
  en: flowEnCatalog,
  'en-US': flowEnCatalog,
  'pt-BR': flowPtBrCatalog,
};

@Injectable()
export class ReferenceWebI18nService {
  readonly locales = ['en-US', 'pt-BR'];
  private readonly i18n = inject(StynxI18nService);

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.i18n.translate(key, params);
  }

  static catalog(locale: string): Promise<Catalog> {
    return Promise.resolve({
      ...(REFERENCE_CATALOGS[locale] ?? REFERENCE_CATALOGS['en-US'] ?? {}),
      ...(STYNX_IAM_CATALOGS[locale] ?? STYNX_IAM_CATALOGS.en ?? {}),
      ...(FLOW_CATALOGS[locale] ?? FLOW_CATALOGS.en ?? {}),
    });
  }
}
