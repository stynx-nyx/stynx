import { Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PublicTenantRoute } from '@stynx-nyx/auth';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';

class PublicTenantBaseController {
  @Get('/status')
  @PublicTenantRoute()
  status() { return { status: 'unreachable' }; }
}

@Controller('/backend-inherited-public-tenant')
@UseGuards(AuthContextGuard)
class InheritedPublicTenantController extends PublicTenantBaseController {}

describe('backend inherited public tenant bootstrap', () => {
  it('rejects a public tenant handler inherited from a base controller without tenancy', async () => {
    const testing = await Test.createTestingModule({
      imports: [StynxAuthModule.forRoot({ tokenVerifier: { verifyAuthorizationHeader: async () => null } })],
      controllers: [InheritedPublicTenantController],
    }).compile();
    const app = testing.createNestApplication();
    await expect(app.init()).rejects.toThrow(/PublicTenantRoute.*StynxTenancyModule/i);
    await app.close();
  });
});
