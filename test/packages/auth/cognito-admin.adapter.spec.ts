import { IdentityAdminError } from '@stynx/contracts';
import {
  buildCognitoAdminOptionsFromEnv,
  mapCognitoError,
} from '../../../packages/auth/src/cognito-admin.adapter';

describe('@stynx/auth cognito admin adapter', () => {
  it('builds options from env and infers profile strategy when AWS_PROFILE exists', () => {
    const options = buildCognitoAdminOptionsFromEnv({
      AWS_REGION: 'us-east-1',
      COGNITO_USER_POOL_ID: 'pool-123',
      AWS_PROFILE: 'dev-profile',
    });

    expect(options).toMatchObject({
      region: 'us-east-1',
      userPoolId: 'pool-123',
      credentialsStrategy: 'profile',
      profile: 'dev-profile',
    });
  });

  it('allows overriding credential strategy', () => {
    const options = buildCognitoAdminOptionsFromEnv(
      {
        AWS_REGION: 'us-east-1',
        COGNITO_USER_POOL_ID: 'pool-123',
        AWS_PROFILE: 'dev-profile',
      },
      {
        credentialsStrategy: 'default-chain',
      },
    );

    expect(options.credentialsStrategy).toBe('default-chain');
    expect(options.profile).toBe(undefined);
  });

  it('throws validation error when required env is missing', () => {
    expect(() =>
      buildCognitoAdminOptionsFromEnv({
        COGNITO_USER_POOL_ID: 'pool-123',
      }),
    ).toThrow(IdentityAdminError);

    try {
      buildCognitoAdminOptionsFromEnv({ COGNITO_USER_POOL_ID: 'pool-123' });
    } catch (error) {
      const typed = error as IdentityAdminError;
      expect(typed.code).toBe('IDENTITY_VALIDATION_ERROR');
    }
  });

  it('maps cognito errors into canonical identity-admin errors', () => {
    const limited = mapCognitoError({
      name: 'TooManyRequestsException',
      message: 'slow down',
    });
    expect(limited.code).toBe('IDENTITY_RATE_LIMITED');

    const unknown = mapCognitoError({
      name: 'UnexpectedServiceError',
      message: 'boom',
      $metadata: { httpStatusCode: 502 },
    });
    expect(unknown.code).toBe('IDENTITY_PROVIDER_ERROR');
    expect(unknown.details?.httpStatusCode).toBe(502);
  });
});
