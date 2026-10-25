import { Injectable } from '@nestjs/common';
import type { ErrorTranslator } from '@stynx-nyx/core';
import { LocaleService } from './locale.service.js';

@Injectable()
export class ErrorTranslatorService implements ErrorTranslator {
  constructor(private readonly localeService: LocaleService) {}

  translate(key: string, locale: string, vars: Record<string, unknown> = {}): unknown {
    return this.localeService.t(key, vars, locale);
  }
}
