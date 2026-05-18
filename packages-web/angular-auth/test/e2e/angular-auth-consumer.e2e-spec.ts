import '@angular/compiler';
import {
  RefreshTokenStorage,
  StynxAngularAuthModule,
  parseJwtPayload,
  stynxAuthGuard,
} from '../../src';

describe('@stynx-web/angular-auth consumer E2E', () => {
  it('exposes auth guards, storage, and JWT helpers to host apps', () => {
    expect(StynxAngularAuthModule).toBeDefined();
    expect(RefreshTokenStorage).toBeDefined();
    expect(stynxAuthGuard).toBeDefined();
    expect(parseJwtPayload('invalid')).toBeNull();
  });
});
