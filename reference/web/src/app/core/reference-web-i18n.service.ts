import { Injectable, inject } from '@angular/core';
import { STYNX_IAM_CATALOGS } from '@stynx-nyx/angular-iam';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import uiEnCatalog from '@stynx-nyx/angular-ui/catalogs/en.json';
import uiPtBrCatalog from '@stynx-nyx/angular-ui/catalogs/pt-BR.json';
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
    'reference.shell.title': 'Reference shell fixture',
    'reference.shell.home': 'Home',
    'reference.shell.settings': 'Settings',
    'reference.shell.content': 'This page demonstrates the published STYNX shell.',
  },
  'pt-BR': {
    'app.title': 'Cockpit do fluxo de referencia',
    'dashboard.title': 'Visao operacional',
    'records.title': 'Registros',
    'work-items.title': 'Itens de trabalho',
    'trash.title': 'Lixeira',
    'reference.shell.title': 'Demonstração do shell de referência',
    'reference.shell.home': 'Início',
    'reference.shell.settings': 'Configurações',
    'reference.shell.content': 'Esta página demonstra o shell publicado do STYNX.',
  },
};

const FLOW_CATALOGS: Record<string, Catalog> = {
  en: flowEnCatalog,
  'en-US': flowEnCatalog,
  'pt-BR': flowPtBrCatalog,
};

const UI_CATALOGS: Record<string, Catalog> = {
  en: uiEnCatalog,
  'en-US': uiEnCatalog,
  'pt-BR': uiPtBrCatalog,
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
      ...(UI_CATALOGS[locale] ?? UI_CATALOGS.en ?? {}),
    });
  }
}
