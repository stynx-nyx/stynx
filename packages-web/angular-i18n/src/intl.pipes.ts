import { ChangeDetectorRef, Pipe, inject } from '@angular/core';
import type { PipeTransform } from '@angular/core';
import { StynxI18nService } from './i18n.service';

type DateInput = Date | number | string | null | undefined;
type NumberInput = number | string | null | undefined;

function normalizeDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeNumber(value: NumberInput): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatterKey(locale: string, options: object): string {
  return `${locale}\u0000${JSON.stringify(options)}`;
}

abstract class LocaleAwarePipe {
  protected readonly i18n = inject(StynxI18nService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private lastLocale = this.i18n.locale();

  protected locale(): string {
    const currentLocale = this.i18n.locale();
    if (currentLocale !== this.lastLocale) {
      this.lastLocale = currentLocale;
      this.changeDetector.markForCheck();
    }
    return currentLocale;
  }
}

@Pipe({
  name: 'stynxIntlDate',
  standalone: true,
  pure: false,
})
export class StynxIntlDatePipe extends LocaleAwarePipe implements PipeTransform {
  private readonly formatterCache = new Map<string, Intl.DateTimeFormat>();

  transform(value: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
    const date = normalizeDate(value);
    if (!date) {
      return '';
    }

    const locale = this.locale();
    const key = formatterKey(locale, options);
    let formatter = this.formatterCache.get(key);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, options);
      this.formatterCache.set(key, formatter);
    }

    return formatter.format(date);
  }
}

@Pipe({
  name: 'stynxIntlNumber',
  standalone: true,
  pure: false,
})
export class StynxIntlNumberPipe extends LocaleAwarePipe implements PipeTransform {
  private readonly formatterCache = new Map<string, Intl.NumberFormat>();

  transform(value: NumberInput, options: Intl.NumberFormatOptions = {}): string {
    const number = normalizeNumber(value);
    if (number === null) {
      return '';
    }

    const locale = this.locale();
    const key = formatterKey(locale, options);
    let formatter = this.formatterCache.get(key);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale, options);
      this.formatterCache.set(key, formatter);
    }

    return formatter.format(number);
  }
}

@Pipe({
  name: 'stynxIntlCurrency',
  standalone: true,
  pure: false,
})
export class StynxIntlCurrencyPipe extends LocaleAwarePipe implements PipeTransform {
  private readonly formatterCache = new Map<string, Intl.NumberFormat>();

  transform(
    value: NumberInput,
    currency = 'USD',
    options: Omit<Intl.NumberFormatOptions, 'currency' | 'style'> = {},
  ): string {
    const number = normalizeNumber(value);
    if (number === null) {
      return '';
    }

    const locale = this.locale();
    const formatOptions: Intl.NumberFormatOptions = {
      ...options,
      currency,
      style: 'currency',
    };
    const key = formatterKey(locale, formatOptions);
    let formatter = this.formatterCache.get(key);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale, formatOptions);
      this.formatterCache.set(key, formatter);
    }

    return formatter.format(number);
  }
}
