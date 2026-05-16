import { Injectable, inject } from '@angular/core';
import { StynxI18nService } from '@stynx-web/angular-i18n';

const CATALOGS: Record<string, Record<string, string>> = {
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

@Injectable()
export class ReferenceWebI18nService {
  readonly locales = ['en-US', 'pt-BR'];
  private readonly i18n = inject(StynxI18nService);

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.i18n.translate(key, params);
  }

  static catalog(locale: string): Promise<Record<string, string>> {
    return Promise.resolve(CATALOGS[locale] ?? CATALOGS['en-US'] ?? {});
  }
}
