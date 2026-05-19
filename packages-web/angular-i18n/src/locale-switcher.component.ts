import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { StynxI18nService } from './i18n.service';
import { StynxTranslatePipe } from './translate.pipe';

@Component({
  selector: 'stynx-locale-switcher',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    <label class="stynx-locale-switcher">
      <span>{{ 'i18n.localeSwitcher.label' | stynxTranslate }}</span>
      <select
        data-testid="locale-switcher-select"
        [value]="i18n.locale()"
        (change)="switchLocale($any($event.target).value)"
      >
        @for (locale of locales; track locale) {
          <option [value]="locale">{{ locale }}</option>
        }
      </select>
    </label>
  `,
  styles: [`
    .stynx-locale-switcher {
      display: inline-flex;
      gap: 0.5rem;
      align-items: center;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocaleSwitcherComponent {
  @Input() locales: string[] = [];

  protected readonly i18n = inject(StynxI18nService);

  async switchLocale(locale: string): Promise<void> {
    await this.i18n.use(locale);
  }
}
