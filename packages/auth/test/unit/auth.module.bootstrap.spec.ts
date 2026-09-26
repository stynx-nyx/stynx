import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StynxAuthModule } from '../../src/auth.module';

@Controller('/auth-bootstrap')
class AuthBootstrapController {
  @Get('/status')
  status() {
    return { status: 'ok' };
  }
}

describe('StynxAuthModule minimal bootstrap fixture', () => {
  it('initializes without product providers so marker validation failures are attributable to tenancy', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StynxAuthModule.forRoot({})],
      controllers: [AuthBootstrapController],
    }).compile();
    const app = moduleRef.createNestApplication();

    await expect(app.init()).resolves.toBe(app);
    await app.close();
  });
});
