import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorBannerService } from '@stynx-nyx/angular';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { StynxErrorBannerComponent } from '../src/error-banner.component';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

describe('StynxErrorBannerComponent', () => {
  it('renders translated keyed text, fallback text, and an accessible alert', async () => {
    const translate = vi.fn((key: string) => key === 'app.errors.conflict' ? 'The record changed.' : key);
    await TestBed.configureTestingModule({
      imports: [StynxErrorBannerComponent],
      providers: [
        ErrorBannerService,
        { provide: StynxI18nService, useValue: { translate } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StynxErrorBannerComponent);
    fixture.detectChanges();
    const banner = TestBed.inject(ErrorBannerService);
    banner.show({ message: 'Server fallback copy', messageKey: 'app.errors.conflict', tone: 'error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('The record changed.');
    expect(fixture.nativeElement.textContent).not.toContain('Server fallback copy');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.getAttribute('data-tone')).toBe('error');
    expect(translate).toHaveBeenCalledWith('app.errors.conflict', {});
  });

  it('shows the readable fallback when no i18n service or message key is configured', async () => {
    await TestBed.configureTestingModule({
      imports: [StynxErrorBannerComponent],
      providers: [ErrorBannerService],
    }).compileComponents();
    const fixture = TestBed.createComponent(StynxErrorBannerComponent);
    fixture.detectChanges();
    TestBed.inject(ErrorBannerService).show({ message: 'Original server text' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Original server text');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.getAttribute('data-tone')).toBe('error');
  });

  it('uses fallback when translation returns the key, clears state on dismiss, and runs an action', async () => {
    const action = vi.fn();
    await TestBed.configureTestingModule({
      imports: [StynxErrorBannerComponent],
      providers: [
        ErrorBannerService,
        { provide: StynxI18nService, useValue: { translate: (key: string) => key } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StynxErrorBannerComponent);
    fixture.detectChanges();
    const banner = TestBed.inject(ErrorBannerService);
    banner.show({ message: 'Readable fallback', messageKey: 'missing.translation', actionLabel: 'Retry', action });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Readable fallback');
    const retry = [...fixture.nativeElement.querySelectorAll('button')]
      .find((button: HTMLButtonElement) => button.textContent?.trim() === 'Retry');
    expect(retry?.getAttribute('type')).toBe('button');
    retry?.click();
    expect(action).toHaveBeenCalledOnce();

    const dismiss = [...fixture.nativeElement.querySelectorAll('button')]
      .find((button: HTMLButtonElement) => /dismiss|close/iu.test(button.getAttribute('aria-label') ?? button.textContent ?? ''));
    expect(dismiss?.getAttribute('aria-label')).toBe('Dismiss error');
    dismiss?.click();
    fixture.detectChanges();
    expect(banner.current()).toBe(null);
  });

  it('uses translated dismiss text and prefixes translated errors with a tenant label', async () => {
    await TestBed.configureTestingModule({
      imports: [StynxErrorBannerComponent],
      providers: [
        ErrorBannerService,
        { provide: StynxI18nService, useValue: { translate: (key: string) => ({
          'ui.error.dismiss': 'Fechar aviso',
          'error.key': 'Request failed',
        })[key] ?? key } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StynxErrorBannerComponent);
    const component = fixture.componentInstance;

    expect(component.dismissLabel()).toBe('Fechar aviso');
    expect(component.displayMessage({
      message: 'Fallback', messageKey: 'error.key', context: { tenantLabel: 'North region' },
    })).toBe('[North region] Request failed');
    expect(component.displayMessage({
      message: 'Fallback', messageKey: 'error.key', context: { tenantLabel: '' },
    })).toBe('Request failed');
    fixture.destroy();
  });
});
