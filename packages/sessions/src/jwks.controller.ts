import { Controller, Get } from '@nestjs/common';
import { SessionJwtSigningService } from './jwt-signing.service';

@Controller('/.well-known')
export class SessionJwksController {
  constructor(private readonly signingService: SessionJwtSigningService) {}

  @Get('/jwks.json')
  async jwks() {
    return this.signingService.getJwks();
  }
}
