import '@angular/compiler';
import { EmptyStateComponent, StynxAngularModule, generateClientRequestId } from '../../src';

describe('@stynx-web/angular consumer E2E', () => {
  it('exposes the shell module and common primitives to host apps', () => {
    expect(StynxAngularModule).toBeDefined();
    expect(EmptyStateComponent).toBeDefined();
    expect(generateClientRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});
