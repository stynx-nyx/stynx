import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({ providedIn: 'root' })
export class I18nService {
  constructor(private readonly translate: TranslateService) {}

  init(): void {
    const language = this.translate.getBrowserLang() ?? 'en';
    this.translate.use(language.match(/en|pt/) ? language : 'en');
  }
}
