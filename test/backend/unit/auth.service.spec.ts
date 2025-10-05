import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuthService } from '@core/auth/auth.service';

describe('AuthService', () => {
  const configStub: Partial<ConfigService> = {
    get: jest.fn().mockReturnValue(undefined),
  };
  const dbStub = {
    transaction: jest.fn().mockImplementation(async (handler: (client: unknown) => unknown) => handler({ query: jest.fn() })),
  };
  const cognitoStub = {
    enqueueSync: jest.fn().mockResolvedValue(undefined),
  };

  it('rejects when bearer token missing', async () => {
    const service = new AuthService(configStub as ConfigService, dbStub as any, cognitoStub as any);
    await expect(service.verifyBearer(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
