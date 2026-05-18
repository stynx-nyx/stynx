import '@angular/compiler';
import { StynxPreferencesFormComponent, StynxProfileFormComponent } from '../../src';

describe('@stynx-web/angular-profile consumer E2E', () => {
  it('exposes profile and preference form components', () => {
    expect(StynxProfileFormComponent).toBeDefined();
    expect(StynxPreferencesFormComponent).toBeDefined();
  });
});
