import { test as base, expect } from '@playwright/test';
import { scanA11y } from './a11y';
import { gotoLoginPage, installSpaAuthMocks, loginAs } from './shared/login';
import { referenceActors, referenceTenants } from './shared/reference-data';

type ReferenceFixtures = {
  loginAsAdmin: () => Promise<void>;
  loginAsRealAdmin: () => Promise<void>;
  a11yProbe: void;
};

export const test = base.extend<ReferenceFixtures>({
  a11yProbe: [async ({ page }, use, testInfo) => {
    await use();
    await scanA11y(page, testInfo);
  }, { auto: true }],
  loginAsAdmin: async ({ page }, use) => {
    await installSpaAuthMocks(page, { actor: referenceActors.admin });
    await use(async () => {
      await loginAs(page, referenceActors.admin, referenceTenants.sampleDemo.id);
    });
  },
  loginAsRealAdmin: async ({ page }, use) => {
    await use(async () => {
      await loginAs(page, referenceActors.admin, referenceTenants.sampleDemo.id);
    });
  },
});

export { expect, gotoLoginPage, installSpaAuthMocks, loginAs, referenceActors, referenceTenants };
