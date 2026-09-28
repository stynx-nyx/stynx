import '@angular/compiler';
import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter, Router } from '@angular/router';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { StynxShellComponent, StynxShellThemeService } from '@stynx-nyx/angular-ui';
import type { StynxShellNavigationGroup } from '@stynx-nyx/angular-ui';

@Component({ standalone: true, template: '<h1>Workspace</h1>' })
class ShellContentComponent {}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe('StynxShellComponent', () => {
  const translations: Record<string, string> = {
    'ui.shell.skipToContent': 'Skip to content',
    'ui.shell.navigation': 'Primary navigation',
    'ui.shell.themeToggle': 'Theme',
    'ui.shell.themeDark': 'Dark',
    'ui.shell.collapseMenu': 'Collapse navigation menu',
    'ui.shell.navigationChanged': 'Navigation changed to',
    'ui.shell.themeChanged': 'Theme changed to',
    'ui.shell.status': 'Application status',
    'nav.home': 'Home',
    'nav.settings': 'Settings',
    'app.title': 'Example workspace',
  };

  async function renderShell(url = '/home', messages = translations) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [StynxShellComponent, ShellContentComponent],
      providers: [
        provideRouter([{ path: 'home', component: ShellContentComponent }, { path: 'settings', component: ShellContentComponent }]),
        {
          provide: StynxI18nService,
          useValue: { translate: (key: string) => messages[key] ?? key },
        },
        StynxShellThemeService,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StynxShellComponent);
    fixture.componentRef.setInput('appTitleKey', 'app.title');
    fixture.componentRef.setInput('mainId', 'workspace-main');
    fixture.componentRef.setInput('navigation', [{
      labelKey: 'ui.shell.navigation',
      items: [
        { labelKey: 'nav.home', route: '/home' },
        { labelKey: 'nav.settings', route: '/settings' },
      ],
    } satisfies StynxShellNavigationGroup]);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    fixture.detectChanges();
    return fixture;
  }

  it('names landmarks, marks the active route, and puts a working skip link first', async () => {
    const fixture = await renderShell();
    const host = fixture.nativeElement as HTMLElement;
    const skip = host.querySelector<HTMLAnchorElement>('a[href="#workspace-main"]');
    const nav = host.querySelector('nav');
    const main = host.querySelector('main#workspace-main');

    expect(skip?.textContent).toContain('Skip to content');
    expect(nav?.getAttribute('aria-label')).toBe('Primary navigation');
    expect(nav?.querySelector('a[aria-current="page"]')?.textContent).toContain('Home');
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(host.querySelector('[role="status"][aria-live="polite"]')?.getAttribute('aria-label'))
      .toBe('Application status');
    expect(host.querySelector('h1')?.textContent).toContain('Example workspace');

    skip?.focus();
    skip?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).toBe(main);
    fixture.destroy();
  });

  it('keeps keyboard traversal ordered through navigation and theme control', async () => {
    const fixture = await renderShell();
    const host = fixture.nativeElement as HTMLElement;
    const tabbables = [...host.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];

    expect(tabbables[0]?.getAttribute('href')).toBe('#workspace-main');
    expect(tabbables.findIndex((node) => node.textContent?.includes('Home'))).toBeGreaterThan(0);
    expect(tabbables.findIndex((node) => node.textContent?.includes('Settings'))).toBeGreaterThan(
      tabbables.findIndex((node) => node.textContent?.includes('Home')),
    );
    expect(tabbables.at(-2)?.textContent).toContain('Collapse navigation menu');
    expect(tabbables.at(-1)?.textContent).toContain('Theme');
    fixture.destroy();
  });

  it.each([
    {
      locale: 'en', navigation: 'Navigation changed to Settings', theme: 'Theme changed to Dark',
      status: 'Application status', themeButton: 'Theme', darkButton: 'Dark',
      messages: translations,
    },
    {
      locale: 'pt-BR', navigation: 'Navegação alterada para Configurações', theme: 'Tema alterado para Escuro',
      status: 'Status da aplicação', themeButton: 'Tema', darkButton: 'Escuro',
      messages: {
        ...translations,
        'ui.shell.navigationChanged': 'Navegação alterada para',
        'ui.shell.themeChanged': 'Tema alterado para',
        'ui.shell.themeDark': 'Escuro',
        'ui.shell.themeToggle': 'Tema',
        'ui.shell.status': 'Status da aplicação',
        'nav.settings': 'Configurações',
      },
    },
  ])('announces navigation and theme selection in $locale', async ({ navigation, theme, status, themeButton, darkButton, messages }) => {
    const fixture = await renderShell('/home', messages);
    const host = fixture.nativeElement as HTMLElement;
    const live = host.querySelector<HTMLElement>('[role="status"][aria-live="polite"]');
    expect(live?.getAttribute('aria-label')).toBe(status);

    await TestBed.inject(Router).navigateByUrl('/settings');
    fixture.detectChanges();
    expect(live?.textContent?.trim()).toBe(navigation);

    const toggle = host.querySelector<HTMLButtonElement>('button.theme-toggle');
    expect(toggle?.textContent?.trim()).toBe(themeButton);
    toggle?.click();
    fixture.detectChanges();
    const dark = host.querySelectorAll<HTMLButtonElement>('.theme-menu button')[2];
    expect(dark?.textContent?.trim()).toBe(darkButton);
    dark?.click();
    fixture.detectChanges();
    expect(live?.textContent?.trim()).toBe(theme);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    fixture.destroy();
  });
});

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    get matches() { return matches; },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { listeners.delete(listener); },
  } as unknown as MediaQueryList;
  const matchMedia = vi.fn((queryText: string) => {
    expect(queryText).toBe('(prefers-color-scheme: dark)');
    return query;
  });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
  return {
    matchMedia,
    change(nextMatches: boolean) {
      matches = nextMatches;
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
    },
  };
}

function configureTheme(platformId?: string): StynxShellThemeService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [StynxShellThemeService, ...(platformId ? [{ provide: PLATFORM_ID, useValue: platformId }] : [])],
  });
  return TestBed.inject(StynxShellThemeService);
}

describe('StynxShellThemeService', () => {
  beforeEach(() => localStorage.removeItem('stynx.shell.theme'));

  afterEach(() => {
    TestBed.resetTestingModule();
    if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage);
    localStorage.removeItem('stynx.shell.theme');
    document.documentElement.removeAttribute('data-stynx-theme');
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else Reflect.deleteProperty(window, 'matchMedia');
  });

  it('follows dark system preference and live change events', () => {
    const media = mockMatchMedia(true);
    const theme = configureTheme();
    expect(media.matchMedia).toHaveBeenCalledOnce();
    expect(theme.preference()).toBe('system');
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('dark');

    media.change(false);
    expect(theme.preference()).toBe('system');
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('light');
    media.change(true);
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('dark');
  });

  it('persists an explicit preference, reloads it, and ignores system changes', () => {
    const media = mockMatchMedia(false);
    const theme = configureTheme();
    theme.setPreference('dark');
    expect(localStorage.getItem('stynx.shell.theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('dark');

    media.change(true);
    media.change(false);
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('dark');
    const reloaded = TestBed.runInInjectionContext(() => new StynxShellThemeService());
    expect(reloaded.preference()).toBe('dark');
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('dark');
  });

  it('resolves invalid stored preferences from the current system preference', () => {
    const media = mockMatchMedia(true);
    localStorage.setItem('stynx.shell.theme', 'sepia');
    const theme = configureTheme();
    expect(theme.preference()).toBe('system');
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('dark');
    media.change(false);
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('light');
  });

  it('defaults to resolved light when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });
    const theme = configureTheme();
    expect(theme.preference()).toBe('system');
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('light');
  });

  it('defaults to resolved light on the server without accessing matchMedia', () => {
    const media = mockMatchMedia(true);
    localStorage.setItem('stynx.shell.theme', 'dark');
    const theme = configureTheme('server');
    expect(theme.preference()).toBe('system');
    expect(media.matchMedia).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('light');
  });

  it('keeps the in-memory preference when storage access is denied', () => {
    mockMatchMedia(false);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('denied'); },
    });
    const theme = configureTheme();
    expect(() => theme.setPreference('dark')).not.toThrow();
    expect(theme.preference()).toBe('dark');
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('dark');
  });
});
