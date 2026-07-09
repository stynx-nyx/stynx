import { BadRequestException, Body, Controller, Get, Headers, Post, Res } from '@nestjs/common';
import { Public, StynxJwtValidator } from '@stynx-nyx/auth';
import { NoIdempotent } from '@stynx-nyx/idempotency';
import { ReferenceDevAuthService } from './reference-dev-auth.service';

interface DevLoginBody {
  email?: string;
  tenantId?: string;
  tenantSlug?: string;
}

@Controller('/_reference')
export class ReferenceDevAuthController {
  constructor(
    private readonly referenceDevAuth: ReferenceDevAuthService,
    private readonly stynxJwtValidator: StynxJwtValidator,
  ) {}

  @Public()
  @Get('/demo-tenants')
  listDemoTenants() {
    return this.referenceDevAuth.listDemoTenants();
  }

  @Public()
  @NoIdempotent()
  @Post('/dev-login')
  login(@Body() body: DevLoginBody) {
    return this.referenceDevAuth.login(body);
  }

  @Public()
  @Get('/auth-verify')
  async authVerify(
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
    @Headers('authorization') rawAuthorization?: string | string[],
  ) {
    const authorization = typeof rawAuthorization === 'string'
      ? rawAuthorization
      : Array.isArray(rawAuthorization) && typeof rawAuthorization[0] === 'string'
        ? rawAuthorization[0]
        : undefined;
    if (!authorization?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing STYNX bearer token');
    }
    const token = authorization.slice('Bearer '.length).trim();
    const startedAt = performance.now();
    await this.stynxJwtValidator.validate(token);
    response.setHeader('X-Stynx-Auth-Verify-Ms', (performance.now() - startedAt).toFixed(3));
    return { status: 'ok' };
  }
}
