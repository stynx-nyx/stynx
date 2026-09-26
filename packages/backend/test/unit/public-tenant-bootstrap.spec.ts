import { Controller, Get, SetMetadata, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { STYNX_PUBLIC_TENANT_ROUTE } from '@stynx-nyx/contracts';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';

@Controller('/backend-public')
@UseGuards(AuthContextGuard)
class BackendOnlyPublicTenantController {
  @Get('/status')
  @SetMetadata(STYNX_PUBLIC_TENANT_ROUTE, { optionalAuth: true })
  status() {
    return { status: 'unreachable' };
  }
}

describe('backend AuthContextGuard public tenant bootstrap', () => {
  it('fails initialization for a public-tenant marker without StynxTenancyModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxAuthModule.forRoot({
          tokenVerifier: {
            verifyAuthorizationHeader: vi.fn(async () => null),
          },
        }),
      ],
      controllers: [BackendOnlyPublicTenantController],
    }).compile();
    const app = moduleRef.createNestApplication();

    await expect(app.init()).rejects.toThrow(/PublicTenantRoute.*StynxTenancyModule/i);
    await app.close();
  });
});
