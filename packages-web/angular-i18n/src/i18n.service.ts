import { Injectable, computed, inject, signal } from '@angular/core';
import { IntlMessageFormat } from 'intl-messageformat';
import { STYNX_I18N_OPTIONS } from './tokens';
import type { StynxCatalog } from './types';

const ICU_ARGUMENT_PATTERN =
  /\{\s*[\w.-]+\s*,\s*(?:plural|select|selectordinal|number|date|time)\s*,/u;

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => `${params[key] ?? ''}`);
}

@Injectable()
export class StynxI18nService {
  private readonly options = inject(STYNX_I18N_OPTIONS);
  private readonly localeState = signal<string>('');
  private readonly catalogState = signal<StynxCatalog>({});
  private readonly formatterCache = new Map<string, IntlMessageFormat>();
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
    this.formatterCache.clear();
  }

  translate(key: string, params: Record<string, string | number> = {}): string {
    const template = this.catalogState()[key] ?? key;
    if (ICU_ARGUMENT_PATTERN.test(template)) {
      return this.formatIcuMessage(key, template, params);
    }
    return interpolate(template, params);
  }

  private formatIcuMessage(
    key: string,
    template: string,
    params: Record<string, string | number>,
  ): string {
    const cacheKey = `${this.localeState()}\u0000${key}`;
    let formatter = this.formatterCache.get(cacheKey);

    if (!formatter) {
      formatter = new IntlMessageFormat(template, this.localeState());
      this.formatterCache.set(cacheKey, formatter);
    }

    return String(formatter.format(params));
  }
}
