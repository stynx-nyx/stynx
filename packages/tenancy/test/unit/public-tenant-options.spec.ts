import { StynxTenancyModule } from '../../src/tenancy.module';

const NOMINAL_ACTOR_V4 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const NOMINAL_ACTOR_V7 = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const TENANT_A = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';

type PublicTenantOptions = {
  resolveHost: (context: { host?: string; path: string }) => string | undefined | Promise<string | undefined>;
  actorId: string;
};

function moduleFor(publicTenant: PublicTenantOptions) {
  return StynxTenancyModule.forRoot({
    headerName: 'X-Portal-Tenant',
    publicTenant,
  } as never);
}

describe('StynxTenancyModule public tenant options', () => {
  it.each([NOMINAL_ACTOR_V4, NOMINAL_ACTOR_V7])(
    'accepts RFC UUID nominal actor %s and exposes the host resolver to tenancy',
    (actorId) => {
      const resolveHost = vi.fn(({ host }: { host?: string }) =>
        host === 'a.portal.test' ? TENANT_A : undefined,
      );

      const dynamicModule = moduleFor({ resolveHost, actorId });
      const optionsProvider = dynamicModule.providers?.find(
        (provider) => typeof provider === 'object' && provider !== null && 'provide' in provider &&
          String(provider.provide).includes('TENANCY_OPTIONS'),
      ) as { useValue?: { headerName?: string; publicTenant?: PublicTenantOptions } } | undefined;

      expect(optionsProvider?.useValue).toEqual(
        expect.objectContaining({
          headerName: 'X-Portal-Tenant',
          publicTenant: expect.objectContaining({ actorId, resolveHost }),
        }),
      );
      expect(optionsProvider?.useValue?.publicTenant?.resolveHost({
        host: 'a.portal.test',
        path: '/portal/records',
      })).toBe(TENANT_A);
    },
  );

  it.each([
    ['', 'missing'],
    ['portal-public', 'not a UUID'],
    ['0197481e-7294-6c53-8b03-5c36d7c2831a', 'UUID version other than v4 or v7'],
  ])('rejects nominal actor %s during module initialization (%s)', (actorId) => {
    expect(() =>
      moduleFor({
        actorId,
        resolveHost: () => TENANT_A,
      }),
    ).toThrow(/publicTenant.*actorId.*UUID/i);
  });

  it('rejects incomplete public tenant configuration during module initialization', () => {
    expect(() => StynxTenancyModule.forRoot({ publicTenant: {} } as never)).toThrow(
      /publicTenant.*resolveHost.*actorId/i,
    );
  });
});
