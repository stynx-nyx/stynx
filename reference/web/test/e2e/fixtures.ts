import { test as base, expect } from '@playwright/test';
import { gotoLoginPage, installSpaAuthMocks, loginAs } from './shared/login';
import { referenceActors, referenceTenants } from './shared/reference-data';

type ReferenceFixtures = {
  loginAsAdmin: () => Promise<void>;
};

export const test = base.extend<ReferenceFixtures>({
  loginAsAdmin: async ({ page }, use) => {
    await installSpaAuthMocks(page, { actor: referenceActors.admin });
    await use(async () => {
      await loginAs(page, referenceActors.admin, referenceTenants.sampleDemo.id);
    });
  },
});

export { expect, gotoLoginPage, installSpaAuthMocks, loginAs, referenceActors, referenceTenants };
