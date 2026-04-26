import { ChangeDetectionStrategy, Component, Inject, Input } from '@angular/core';
import { StynxI18nService } from './i18n.service';

@Component({
  selector: 'stynx-locale-switcher',
  standalone: true,
  template: `
    <label class="stynx-locale-switcher">
      <span>Locale</span>
      <select [value]="i18n.locale()" (change)="switchLocale($any($event.target).value)">
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

  constructor(@Inject(StynxI18nService) protected readonly i18n: StynxI18nService) {}

  async switchLocale(locale: string): Promise<void> {
    await this.i18n.use(locale);
  }
}