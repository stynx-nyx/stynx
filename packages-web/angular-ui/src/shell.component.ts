import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Input,
  InjectionToken,
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';

export type StynxShellThemePreference = 'light' | 'dark' | 'system';

export interface StynxShellNavigationItem {
  labelKey: string;
  route: string;
  icon?: string;
}

export interface StynxShellNavigationGroup {
  labelKey: string;
  items: StynxShellNavigationItem[];
}

export const STYNX_SHELL_THEME_STORAGE_KEY = new InjectionToken<string>(
  'STYNX_SHELL_THEME_STORAGE_KEY',
  { providedIn: 'root', factory: () => 'stynx.shell.theme' },
);

const VALID_PREFERENCES = new Set<StynxShellThemePreference>(['light', 'dark', 'system']);

@Component({
  selector: 'stynx-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" [href]="'#' + mainId" (click)="focusMain($event)"
       (keydown.enter)="focusMain($event)">{{ translate('ui.shell.skipToContent') }}</a>
    <header class="shell-header">
      <h1>{{ translate(appTitleKey) }}</h1>
    </header>
    <nav [attr.aria-label]="translate('ui.shell.navigation')">
      @if (!menuCollapsed()) {
        <div class="shell-navigation">
          @for (group of navigation; track group.labelKey) {
            <section class="navigation-group" [attr.aria-label]="translate(group.labelKey)">
              <span class="group-label">{{ translate(group.labelKey) }}</span>
              @for (item of group.items; track item.route) {
                <a [routerLink]="item.route" routerLinkActive="active"
                   [routerLinkActiveOptions]="{ exact: true }"
                   [attr.aria-current]="isActive(item.route) ? 'page' : null">
                  @if (item.icon) { <span aria-hidden="true">{{ item.icon }}</span> }
                  {{ translate(item.labelKey) }}
                </a>
              }
            </section>
          }
        </div>
      }
      <button type="button" class="menu-toggle" [attr.aria-expanded]="!menuCollapsed()"
              (click)="toggleMenu()">
        {{ translate(menuCollapsed() ? 'ui.shell.expandMenu' : 'ui.shell.collapseMenu') }}
      </button>
    </nav>
    <div class="shell-controls">
      <button type="button" class="theme-toggle" [attr.aria-expanded]="themeMenuOpen()"
              aria-haspopup="true" (click)="themeMenuOpen.update((open) => !open)">
        {{ translate('ui.shell.themeToggle') }}
      </button>
      @if (themeMenuOpen()) {
        <div class="theme-menu" role="group" [attr.aria-label]="translate('ui.shell.themeToggle')">
          <button type="button" (click)="setTheme('system')">{{ translate('ui.shell.themeSystem') }}</button>
          <button type="button" (click)="setTheme('light')">{{ translate('ui.shell.themeLight') }}</button>
          <button type="button" (click)="setTheme('dark')">{{ translate('ui.shell.themeDark') }}</button>
        </div>
      }
    </div>
    <main [id]="mainId" tabindex="-1"><ng-content /></main>
    <div class="visually-hidden" role="status" aria-live="polite"
         [attr.aria-label]="translate('ui.shell.status')">{{ statusMessage() }}</div>
  `,
  styles: [`
    :host { display: block; }
    .skip-link { position: absolute; z-index: 10; inset-block-start: 0; inset-inline-start: 0;
      transform: translateY(-150%); padding: .75rem 1rem; background: Canvas; color: CanvasText; }
    .skip-link:focus { transform: translateY(0); }
    .shell-navigation, .navigation-group { display: flex; gap: .75rem; }
    .shell-navigation { flex-wrap: wrap; }
    .navigation-group { align-items: center; }
    .active { font-weight: 700; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  `],
})
export class StynxShellComponent {
  @Input() navigation: StynxShellNavigationGroup[] = [];
  @Input() appTitleKey = 'ui.shell.appTitle';
  @Input() mainId = 'stynx-main';
  readonly menuCollapsed = signal(false);
  readonly themeMenuOpen = signal(false);
  readonly statusMessage = signal('');
  private readonly document = inject(DOCUMENT);
  private readonly i18n = inject(StynxI18nService);
  private readonly router = inject(Router);
  private readonly theme = inject(StynxShellThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly activeUrl = signal(this.router.url);
  private readonly activeRouteLabel = computed(() => {
    const url = this.activeUrl();
    for (const group of this.navigation) {
      const match = group.items.find((item) => item.route === url);
      if (match) return match.labelKey;
    }
    return '';
  });

  constructor() {
    const subscription = this.router.events.pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const navigation = event as NavigationEnd;
        this.activeUrl.set(navigation.urlAfterRedirects);
        const labelKey = this.activeRouteLabel();
        this.statusMessage.set(labelKey
          ? `${this.translate('ui.shell.navigationChanged')} ${this.translate(labelKey)}`
          : this.translate('ui.shell.navigationChanged'));
      });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  translate(key: string): string {
    return this.i18n.translate(key);
  }

  isActive(route: string): boolean {
    return this.activeUrl() === route || this.router.isActive(route, {
      paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored',
    });
  }

  focusMain(event: Event): void {
    event.preventDefault();
    const main = this.document.getElementById(this.mainId);
    main?.focus();
  }

  toggleMenu(): void {
    this.menuCollapsed.update((collapsed) => !collapsed);
  }

  setTheme(preference: StynxShellThemePreference): void {
    this.theme.setPreference(preference);
    this.themeMenuOpen.set(false);
    this.statusMessage.set(`${this.translate('ui.shell.themeChanged')} ${this.translate(`ui.shell.theme${
      preference === 'system' ? 'System' : preference === 'light' ? 'Light' : 'Dark'
    }`)}`);
  }
}

@Injectable({ providedIn: 'root' })
export class StynxShellThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly storageKey = inject(STYNX_SHELL_THEME_STORAGE_KEY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly preferenceState = signal<StynxShellThemePreference>(this.readPreference());
  readonly preference = this.preferenceState.asReadonly();
  private mediaQuery: MediaQueryList | null = null;
  private readonly mediaListener = (event: MediaQueryListEvent) => {
    if (this.preferenceState() === 'system') this.applyResolved(event.matches ? 'dark' : 'light');
  };

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.mediaQuery = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
      this.mediaQuery?.addEventListener?.('change', this.mediaListener);
      if (!this.mediaQuery?.addEventListener) this.mediaQuery?.addListener?.(this.mediaListener);
      this.destroyRef.onDestroy(() => {
        this.mediaQuery?.removeEventListener?.('change', this.mediaListener);
        if (!this.mediaQuery?.removeEventListener) this.mediaQuery?.removeListener?.(this.mediaListener);
      });
    }
    this.applyPreference(this.preferenceState());
  }

  setPreference(preference: StynxShellThemePreference): void {
    if (!VALID_PREFERENCES.has(preference)) throw new TypeError('Unsupported shell theme preference');
    this.preferenceState.set(preference);
    try {
      const storage = this.document.defaultView?.localStorage;
      if (preference === 'system') storage?.removeItem(this.storageKey);
      else storage?.setItem(this.storageKey, preference);
    } catch {
      // Storage may be disabled by browser policy; the in-memory preference still applies.
    }
    this.applyPreference(preference);
  }

  private readPreference(): StynxShellThemePreference {
    if (!isPlatformBrowser(this.platformId)) return 'system';
    try {
      const stored = this.document.defaultView?.localStorage.getItem(this.storageKey);
      return stored && VALID_PREFERENCES.has(stored as StynxShellThemePreference)
        ? stored as StynxShellThemePreference
        : 'system';
    } catch {
      return 'system';
    }
  }

  private applyPreference(preference: StynxShellThemePreference): void {
    if (preference !== 'system') {
      this.applyResolved(preference);
      return;
    }
    this.applyResolved(this.mediaQuery?.matches ? 'dark' : 'light');
  }

  private applyResolved(theme: 'light' | 'dark'): void {
    this.document.documentElement?.setAttribute('data-stynx-theme', theme);
  }
}
