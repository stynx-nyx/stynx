import '@angular/compiler';
import { StynxActiveSessionsComponent } from '../../src';

describe('@stynx-web/angular-sessions consumer E2E', () => {
  it('exposes active-session management UI', () => {
    expect(StynxActiveSessionsComponent).toBeDefined();
  });
});
