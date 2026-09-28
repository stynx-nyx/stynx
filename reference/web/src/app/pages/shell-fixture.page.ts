import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LocaleSwitcherComponent } from '@stynx-nyx/angular-i18n';
import {
  StynxShellComponent,
  StynxShellNavigationGroup,
} from '@stynx-nyx/angular-ui';
import { ReferenceWebI18nService } from '../core/reference-web-i18n.service';

@Component({
  selector: 'stynx-reference-shell-fixture-page',
  standalone: true,
  imports: [LocaleSwitcherComponent, StynxShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <stynx-shell
      [navigation]="navigation"
      appTitleKey="reference.shell.title"
      mainId="reference-shell-main"
    >
      <section class="fixture-content">
        <p>{{ i18n.t('reference.shell.content') }}</p>
        <stynx-locale-switcher [locales]="i18n.locales"></stynx-locale-switcher>
      </section>
    </stynx-shell>
  `,
  styles: [`
    :host { display: block; padding: 2rem; }
    .fixture-content { display: grid; gap: 1rem; }
  `],
})
export class ShellFixturePageComponent {
  protected readonly i18n = inject(ReferenceWebI18nService);
  protected readonly navigation: StynxShellNavigationGroup[] = [
    {
      labelKey: 'ui.shell.navigation',
      items: [
        { labelKey: 'reference.shell.home', route: '/shell' },
        { labelKey: 'reference.shell.settings', route: '/shell/settings' },
      ],
    },
  ];
}
