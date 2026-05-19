import { Injectable, computed, inject, signal } from '@angular/core';
import { STYNX_I18N_OPTIONS } from './tokens';
import type { StynxCatalog } from './types';

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => `${params[key] ?? ''}`);
}

@Injectable()
export class StynxI18nService {
  private readonly options = inject(STYNX_I18N_OPTIONS);
  private readonly localeState = signal<string>('');
  private readonly catalogState = signal<StynxCatalog>({});
  readonly locale = computed(() => this.localeState());
  readonly catalog = computed(() => this.catalogState());
  readonly supportedLocales: string[];

  constructor() {
    this.localeState.set(this.options.defaultLocale);
    this.supportedLocales = this.options.supportedLocales ?? [this.options.defaultLocale];
  }

  async initialize(): Promise<void> {
    await this.use(this.options.defaultLocale);
  }

  async use(locale: string): Promise<void> {
    const catalog = await this.options.loadCatalog(locale);
    this.localeState.set(locale);
    this.catalogState.set(catalog);
  }

  translate(key: string, params: Record<string, string | number> = {}): string {
    const template = this.catalogState()[key] ?? key;
    return interpolate(template, params);
  }
}
