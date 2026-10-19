import { platformRoleNames } from '@stynx-nyx/data';
import { DEFAULT_TEST_APP_ROLES, testAppRolePrefix } from '../src/roles.js';

// SM-06 (S-18): createTestApp's default roles are the platform's stynx roles,
// and any roles it takes are one product's <prefix>_{owner,app,reader}.
describe('test app roles', () => {
  it('defaults to the platform stynx roles', () => {
    expect(DEFAULT_TEST_APP_ROLES).toEqual(platformRoleNames());
    expect(Object.isFrozen(DEFAULT_TEST_APP_ROLES)).toBe(true);
    expect(testAppRolePrefix(DEFAULT_TEST_APP_ROLES)).toBe('stynx');
  });

  it('derives the product prefix', () => {
    expect(testAppRolePrefix(platformRoleNames('demo'))).toBe('demo');
    expect(testAppRolePrefix({ owner: 'my_app_owner', app: 'my_app_app', reader: 'my_app_reader' })).toBe(
      'my_app',
    );
  });

  it('refuses names that are not one lower-case prefix', () => {
    for (const roles of [
      { owner: 'demo_owner', app: 'demo_app', reader: 'stynx_reader' },
      { owner: 'stynx_owner', app: 'demo_app', reader: 'demo_reader' },
      { owner: 'demo_owner', app: 'demo_application', reader: 'demo_reader' },
      { owner: '_owner', app: '_app', reader: '_reader' },
      { owner: 'Demo_owner', app: 'Demo_app', reader: 'Demo_reader' },
      { owner: "x'_owner", app: "x'_app", reader: "x'_reader" },
    ]) {
      expect(() => testAppRolePrefix(roles)).toThrow('Invalid test app roles');
    }
  });
});
