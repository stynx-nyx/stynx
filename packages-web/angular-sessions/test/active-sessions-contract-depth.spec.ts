import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxSessionService } from '@stynx-web/angular-auth';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { StynxToastService } from '@stynx-web/angular-ui';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StynxActiveSessionsComponent } from '../src/active-sessions.component';
import type { StynxActiveSession, StynxSessionsAdapter } from '../src/types';
import { renderComponent } from './support/test-bed';

const TRANSLATIONS: Record<string, string> = {
  'sessions.active.actions.revoke': 'Revoke',
  'sessions.active.actions.revokeOthers': 'Revoke other sessions',
  'sessions.active.columns.createdAt': 'Created',
  'sessions.active.columns.expiresAt': 'Expires',
  'sessions.active.columns.lastIp': 'IP',
  'sessions.active.columns.lastSeenAt': 'Last seen',
  'sessions.active.columns.userAgent': 'Browser',
  'sessions.active.confirmRevokeOthers.confirm': 'Revoke all others',
  'sessions.active.confirmRevokeOthers.message': 'All other active sessions will be revoked.',
  'sessions.active.confirmRevokeOthers.title': 'Revoke other sessions?',
  'sessions.active.current': 'Current session',
  'sessions.active.labels.thisDevice': 'This device',
  'sessions.active.toast.revoked': 'Session revoked.',
  'sessions.active.toast.revokedOthers': 'Other sessions revoked.',
  'sessions.active.values.unknown': 'Unknown',
  'ui.confirmDialog.cancel': 'Cancel',
};

const SESSIONS: StynxActiveSession[] = [
  {
    sid: 'sid-current',
    sessionId: 'sid-current',
    tenantId: 'tenant-a',
    createdAt: '2026-06-10T10:00:00.000Z',
    expiresAt: '2026-06-10T10:15:00.000Z',
    current: true,
  },
  {
    sid: 'sid-other',
    sessionId: 'sid-other',
    tenantId: 'tenant-a',
    createdAt: '2026-06-10T09:00:00.000Z',
    expiresAt: '2026-06-10T09:15:00.000Z',
    current: false,
  },
];

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (!String(error).includes('Cannot set base providers')) {
      throw error;
    }
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular-sessions W04 active-session contract depth', () => {
  it('gates revoke-other-sessions behind confirmation and preserves session expiry fields in the UI', async () => {
    const adapter: StynxSessionsAdapter = {
      list: vi.fn(async () => [...SESSIONS]),
      revoke: vi.fn(async () => undefined),
      revokeOthers: vi.fn(async () => undefined),
    };
    const toast = { push: vi.fn() };
    const fixture = await renderComponent(StynxActiveSessionsComponent, {
      inputs: { adapter },
      providers: [
        { provide: StynxSessionService, useValue: { snapshot: () => ({ sid: 'sid-current' }) } },
        { provide: StynxToastService, useValue: toast },
        {
          provide: StynxI18nService,
          useValue: {
            locale: () => 'en-US',
            translate: (key: string) => TRANSLATIONS[key] ?? key,
          },
        },
      ],
    });

    await fixture.componentInstance.load();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('2026-06-10T10:15:00.000Z');
    expect(host.textContent).toContain('2026-06-10T09:15:00.000Z');
    host.querySelector<HTMLButtonElement>('[data-testid="active-sessions-revoke-others"]')?.click();
    fixture.detectChanges();

    expect(adapter.revokeOthers).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Revoke other sessions?');

    const confirm = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Revoke all others'));
    confirm?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(adapter.revokeOthers).toHaveBeenCalledTimes(1);
    expect(toast.push).toHaveBeenCalledWith('Other sessions revoked.', 'warning');
  });
});
