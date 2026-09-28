import '@angular/compiler';
import { Component } from '@angular/core';
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
    'ui.shell.status': 'Shell status',
    'nav.home': 'Home',
    'nav.settings': 'Settings',
    'app.title': 'Example workspace',
  };

  async function renderShell(url = '/home') {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [StynxShellComponent, ShellContentComponent],
      providers: [
        provideRouter([{ path: 'home', component: ShellContentComponent }, { path: 'settings', component: ShellContentComponent }]),
        {
          provide: StynxI18nService,
          useValue: { translate: (key: string) => translations[key] ?? key },
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
    expect(host.querySelector('[aria-live="polite"]')).not.toBeNull();
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
    expect(tabbables.at(-1)?.textContent).toContain('Theme');
    fixture.destroy();
  });

  it('persists explicit themes, reloads them, and falls back from invalid or denied storage', async () => {
    const theme = TestBed.inject(StynxShellThemeService);
    theme.setPreference('dark');
    expect(localStorage.getItem('stynx.shell.theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-stynx-theme')).toBe('dark');

    const reloaded = TestBed.runInInjectionContext(() => new StynxShellThemeService());
    expect(reloaded.preference()).toBe('dark');

    localStorage.setItem('stynx.shell.theme', 'sepia');
    const invalid = TestBed.runInInjectionContext(() => new StynxShellThemeService());
    expect(invalid.preference()).toBe('system');
    expect(document.documentElement.getAttribute('data-stynx-theme')).not.toBe('system');

    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('denied'); } });
    expect(() => TestBed.runInInjectionContext(() => new StynxShellThemeService()).setPreference('light'))
      .not.toThrow();
    if (original) Object.defineProperty(window, 'localStorage', original);
    fixtureDestroyIfNeeded();
  });
});

function fixtureDestroyIfNeeded(): void {
  TestBed.resetTestingModule();
}
