import { SessionJwksController } from '../../src/jwks.controller';
import type { SessionJwtSigningService } from '../../src/jwt-signing.service';

describe('SessionJwksController API contract', () => {
  it('publishes the signing service JWKS payload', async () => {
    const signingService = {
      getJwks: vi.fn(async () => ({ keys: [{ kid: 'test-key' }] })),
    } as unknown as SessionJwtSigningService;
    const controller = new SessionJwksController(signingService);

    await expect(controller.jwks()).resolves.toEqual({ keys: [{ kid: 'test-key' }] });
    expect(signingService.getJwks).toHaveBeenCalledWith();
  });
});
