import { ChangeDetectorRef, Pipe, inject } from '@angular/core';
import type { PipeTransform } from '@angular/core';
import { StynxI18nService } from './i18n.service';

@Pipe({
  name: 'stynxTranslate',
  standalone: true,
  pure: false,
})
export class StynxTranslatePipe implements PipeTransform {
  private readonly i18n = inject(StynxI18nService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private lastLocale = this.i18n.locale();

  transform(key: string, params: Record<string, string | number> = {}): string {
    const currentLocale = this.i18n.locale();
    if (currentLocale !== this.lastLocale) {
      this.lastLocale = currentLocale;
      this.changeDetector.markForCheck();
    }
    return this.i18n.translate(key, params);
  }
}
