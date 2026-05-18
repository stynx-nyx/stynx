import {
  InMemoryTokenStore,
  StynxApiClient,
  StynxHttpTransport,
  StynxSdkClient,
  parseJwtPayload,
} from '../../src';

describe('@stynx-web/sdk consumer E2E', () => {
  it('exposes transport, client, token store, and JWT helpers to web hosts', () => {
    expect(StynxApiClient).toBeDefined();
    expect(StynxHttpTransport).toBeDefined();
    expect(StynxSdkClient).toBeDefined();
    expect(new InMemoryTokenStore().read()).toBeNull();
    expect(parseJwtPayload('invalid')).toBeNull();
  });
});
