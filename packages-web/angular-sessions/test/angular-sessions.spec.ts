import '@angular/compiler';
import { StynxActiveSessionsComponent } from '../src/active-sessions.component';
import type { StynxActiveSession, StynxSessionsAdapter } from '../src/types';

describe('@stynx-web/angular-sessions', () => {
  it('loads sessions and revokes a non-current session', async () => {
    const state: StynxActiveSession[] = [
      {
        sid: 'sid-current',
        tenantId: 'tenant-a',
        createdAt: '2026-04-24T00:00:00.000Z',
        expiresAt: '2026-04-24T01:00:00.000Z',
      },
      {
        sid: 'sid-other',
        tenantId: 'tenant-b',
        createdAt: '2026-04-24T00:00:00.000Z',
        expiresAt: '2026-04-24T01:00:00.000Z',
      },
    ];
    const adapter: StynxSessionsAdapter = {
      list: vi.fn(async () => [...state]),
      revoke: vi.fn(async (sid: string) => {
        const index = state.findIndex((entry) => entry.sid === sid);
        state.splice(index, 1);
      }),
      revokeOthers: vi.fn(async () => undefined),
    };

    const component = new StynxActiveSessionsComponent(
      {
        snapshot: () => ({ sid: 'sid-current' }),
      } as never,
      {
        push: () => undefined,
      } as never,
    );
    component.adapter = adapter;

    await component.load();
    expect(component.sessions[0]?.current).toBe(true);

    await component.revoke('sid-other');
    expect(adapter.revoke).toHaveBeenCalledWith('sid-other');
    expect(component.sessions).toHaveLength(1);

    await component.revokeOthers();
    expect(adapter.revokeOthers).toHaveBeenCalledTimes(1);
  });
});
