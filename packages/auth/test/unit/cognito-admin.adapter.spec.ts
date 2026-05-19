import {
  AdminAddUserToGroupCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ListGroupsCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { IdentityAdminError } from '@stynx/contracts';
import {
  CognitoIdentityAdminAdapter,
  buildCognitoAdminOptionsFromEnv,
  mapCognitoError,
} from '../../src/cognito-admin.adapter';
import type { Mock } from 'vitest';

function makeAdapter(send: Mock) {
  const adapter = new CognitoIdentityAdminAdapter({
    region: 'us-east-1',
    userPoolId: 'pool-1',
  });
  Object.defineProperty(adapter, 'client', { value: { send } });
  return adapter;
}

const cognitoUser = {
  Username: 'alice',
  Enabled: true,
  UserStatus: 'CONFIRMED',
  UserCreateDate: new Date('2026-01-01T00:00:00Z'),
  UserLastModifiedDate: new Date('2026-02-01T00:00:00Z'),
  Attributes: [
    { Name: 'email', Value: 'a@b.test' },
    { Name: 'phone_number', Value: '+1' },
    { Name: 'sub', Value: 'sub-1' },
  ],
};

describe('mapCognitoError', () => {
  it.each([
    ['UserNotFoundException', 'IDENTITY_NOT_FOUND'],
    ['ResourceNotFoundException', 'IDENTITY_NOT_FOUND'],
    ['NotAuthorizedException', 'IDENTITY_FORBIDDEN'],
    ['AccessDeniedException', 'IDENTITY_FORBIDDEN'],
    ['UsernameExistsException', 'IDENTITY_CONFLICT'],
    ['AliasExistsException', 'IDENTITY_CONFLICT'],
    ['TooManyRequestsException', 'IDENTITY_RATE_LIMITED'],
    ['InvalidParameterException', 'IDENTITY_VALIDATION_ERROR'],
    ['InvalidPasswordException', 'IDENTITY_VALIDATION_ERROR'],
    ['SomeOtherException', 'IDENTITY_PROVIDER_ERROR'],
  ])('maps %s → %s', (name, expectedCode) => {
    const mapped = mapCognitoError({ name, message: 'm', $metadata: { httpStatusCode: 400 } });
    expect(mapped).toBeInstanceOf(IdentityAdminError);
    expect(mapped.code).toBe(expectedCode);
  });

  it('produces a default IDENTITY_PROVIDER_ERROR for unknown shapes', () => {
    const mapped = mapCognitoError(undefined);
    expect(mapped.code).toBe('IDENTITY_PROVIDER_ERROR');
  });
});

describe('CognitoIdentityAdminAdapter', () => {
  it('listUsers calls ListUsersCommand with the email filter when present', async () => {
    const send = vi.fn(async () => ({ Users: [cognitoUser], PaginationToken: 'next' }));
    const adapter = makeAdapter(send);
    const result = await adapter.listUsers({ email: 'a@b' });
    const command = send.mock.calls[0]?.[0] as ListUsersCommand;
    expect(command).toBeInstanceOf(ListUsersCommand);
    expect(command.input.Filter).toBe('email ^= "a@b"');
    expect(result.items).toHaveLength(1);
    expect(result.nextToken).toBe('next');
  });

  it('listUsers uses the phone filter when only phone is set', async () => {
    const send = vi.fn(async () => ({ Users: [] }));
    const adapter = makeAdapter(send);
    await adapter.listUsers({ phone: '+5511' });
    const command = send.mock.calls[0]?.[0] as ListUsersCommand;
    expect(command.input.Filter).toBe('phone_number ^= "+5511"');
  });

  it('listUsers routes through ListUsersInGroupCommand when group is set', async () => {
    const send = vi.fn(async () => ({ Users: [cognitoUser] }));
    const adapter = makeAdapter(send);
    await adapter.listUsers({ group: 'admins' });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(ListUsersInGroupCommand);
  });

  it('listUsers clamps limit to 60 when caller requests more', async () => {
    const send = vi.fn(async () => ({ Users: [] }));
    const adapter = makeAdapter(send);
    await adapter.listUsers({ limit: 500 });
    const command = send.mock.calls[0]?.[0] as ListUsersCommand;
    expect(command.input.Limit).toBe(60);
  });

  it('listUsers maps mapCognitoError on failure', async () => {
    const send = vi.fn(async () => {
      throw { name: 'NotAuthorizedException', message: 'no' };
    });
    const adapter = makeAdapter(send);
    await expect(adapter.listUsers({})).rejects.toBeInstanceOf(IdentityAdminError);
  });

  it('getUser calls AdminGetUserCommand and returns a IdentityUserDetail', async () => {
    const send = vi.fn(async () => ({
      Username: 'alice',
      Enabled: true,
      UserStatus: 'CONFIRMED',
      UserCreateDate: new Date('2026-01-01T00:00:00Z'),
      UserAttributes: [{ Name: 'email', Value: 'a@b' }],
    }));
    const adapter = makeAdapter(send);
    const result = await adapter.getUser('alice');
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(AdminGetUserCommand);
    expect(result.username).toBe('alice');
    expect(result.email).toBe('a@b');
  });

  it('getUserBySubject lists users by sub filter then fetches details', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Users: [cognitoUser] }) // ListUsersCommand
      .mockResolvedValueOnce({
        Username: 'alice',
        Enabled: true,
        UserStatus: 'CONFIRMED',
        UserAttributes: [],
      }); // AdminGetUserCommand
    const adapter = makeAdapter(send);
    const result = await adapter.getUserBySubject('sub-1');
    expect(result.username).toBe('alice');
    const list = send.mock.calls[0]?.[0] as ListUsersCommand;
    expect(list.input.Filter).toBe('sub = "sub-1"');
  });

  it('getUserBySubject throws IDENTITY_NOT_FOUND when nothing matches', async () => {
    const send = vi.fn(async () => ({ Users: [] }));
    const adapter = makeAdapter(send);
    await expect(adapter.getUserBySubject('sub-x')).rejects.toBeInstanceOf(IdentityAdminError);
  });

  it('getUserBySubject preserves IdentityAdminError thrown from getUser', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Users: [cognitoUser] })
      .mockRejectedValueOnce({ name: 'UserNotFoundException', message: 'gone' });
    const adapter = makeAdapter(send);
    await expect(adapter.getUserBySubject('sub-1')).rejects.toBeInstanceOf(IdentityAdminError);
  });

  it('getUserBySubject maps provider failures while listing by subject', async () => {
    const send = vi.fn(async () => {
      throw { name: 'AccessDeniedException', message: 'denied' };
    });
    const adapter = makeAdapter(send);
    await expect(adapter.getUserBySubject('sub-1')).rejects.toMatchObject({
      code: 'IDENTITY_FORBIDDEN',
    });
  });

  it('updateUser composes the right attribute list including custom: prefix', async () => {
    const send = vi.fn(async () => ({}));
    const adapter = makeAdapter(send);
    Object.defineProperty(adapter, 'client', {
      value: {
        send: vi
          .fn()
          .mockResolvedValueOnce(undefined) // AdminUpdateUserAttributes
          .mockResolvedValueOnce({
            Username: 'alice',
            Enabled: true,
            UserStatus: 'CONFIRMED',
            UserAttributes: [],
          }), // AdminGetUserCommand for getUser
      },
    });
    await adapter.updateUser('alice', {
      email: 'new@b',
      phoneNumber: '+1',
      name: 'Alice',
      givenName: 'A',
      familyName: 'L',
      custom: { dept: 'eng' },
    });
    const send2 = (adapter as unknown as { client: { send: Mock } }).client.send;
    const update = send2.mock.calls[0]?.[0] as AdminUpdateUserAttributesCommand;
    expect(update).toBeInstanceOf(AdminUpdateUserAttributesCommand);
    const attrs = update.input.UserAttributes ?? [];
    const byName = Object.fromEntries(attrs.map((a) => [a.Name, a.Value]));
    expect(byName.email).toBe('new@b');
    expect(byName.phone_number).toBe('+1');
    expect(byName['custom:dept']).toBe('eng');
  });

  it('updateUser short-circuits attribute push when nothing changes', async () => {
    const send = vi.fn(async () => ({
      Username: 'alice',
      Enabled: true,
      UserAttributes: [],
    }));
    const adapter = makeAdapter(send);
    await adapter.updateUser('alice', {});
    // Only the AdminGetUserCommand should have been issued.
    expect(send.mock.calls).toHaveLength(1);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(AdminGetUserCommand);
  });

  it('disableUser / enableUser issue the right commands', async () => {
    const send = vi.fn(async () => ({}));
    const adapter = makeAdapter(send);
    await adapter.disableUser('alice');
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(AdminDisableUserCommand);
    await adapter.enableUser('alice');
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(AdminEnableUserCommand);
  });

  it('listGroupsForUser maps response.Groups and filters blanks', async () => {
    const send = vi.fn(async () => ({
      Groups: [{ GroupName: 'admins', Description: 'admins desc' }, { GroupName: '' }, {}],
    }));
    const adapter = makeAdapter(send);
    const result = await adapter.listGroupsForUser('alice');
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(AdminListGroupsForUserCommand);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: 'admins', description: 'admins desc' });
  });

  it('listGroups paginates via NextToken and maps items', async () => {
    const send = vi.fn(async () => ({
      Groups: [{ GroupName: 'g1' }],
      NextToken: 'tok',
    }));
    const adapter = makeAdapter(send);
    const result = await adapter.listGroups({ limit: 10, token: 't' });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(ListGroupsCommand);
    expect(result.nextToken).toBe('tok');
    expect(result.items[0].name).toBe('g1');
  });

  it('addUserToGroup / removeUserFromGroup issue correct commands', async () => {
    const send = vi.fn(async () => ({}));
    const adapter = makeAdapter(send);
    await adapter.addUserToGroup('alice', 'admins');
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(AdminAddUserToGroupCommand);
    await adapter.removeUserFromGroup('alice', 'admins');
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(AdminRemoveUserFromGroupCommand);
  });

  it('resetUserPassword + setUserPassword issue correct commands', async () => {
    const send = vi.fn(async () => ({}));
    const adapter = makeAdapter(send);
    await adapter.resetUserPassword('alice');
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(AdminResetUserPasswordCommand);
    await adapter.setUserPassword('alice', 'pw', false);
    const set = send.mock.calls[1]?.[0] as AdminSetUserPasswordCommand;
    expect(set).toBeInstanceOf(AdminSetUserPasswordCommand);
    expect(set.input.Permanent).toBe(false);
  });

  it('verifyUserChannels marks email_verified + phone_number_verified', async () => {
    const send = vi.fn(async () => ({}));
    const adapter = makeAdapter(send);
    await adapter.verifyUserChannels('alice', { email: true, phone: true });
    const cmd = send.mock.calls[0]?.[0] as AdminUpdateUserAttributesCommand;
    expect(cmd).toBeInstanceOf(AdminUpdateUserAttributesCommand);
    const attrs = cmd.input.UserAttributes ?? [];
    expect(attrs).toEqual([
      { Name: 'email_verified', Value: 'true' },
      { Name: 'phone_number_verified', Value: 'true' },
    ]);
  });

  it('verifyUserChannels skips the call when neither channel is requested', async () => {
    const send = vi.fn(async () => ({}));
    const adapter = makeAdapter(send);
    await adapter.verifyUserChannels('alice', {});
    expect(send).not.toHaveBeenCalled();
  });

  it('resolveCredentials default-chain returns undefined (uses AWS SDK default)', () => {
    // Construct doesn't throw → default-chain path works.
    expect(
      () =>
        new CognitoIdentityAdminAdapter({
          region: 'us-east-1',
          userPoolId: 'p',
          credentialsStrategy: 'default-chain',
        }),
    ).not.toThrow();
  });

  it('resolveCredentials with strategy=profile throws when no profile is set', () => {
    const originalEnv = process.env.AWS_PROFILE;
    delete process.env.AWS_PROFILE;
    try {
      expect(
        () =>
          new CognitoIdentityAdminAdapter({
            region: 'us-east-1',
            userPoolId: 'p',
            credentialsStrategy: 'profile',
          }),
      ).toThrow(IdentityAdminError);
    } finally {
      if (originalEnv !== undefined) process.env.AWS_PROFILE = originalEnv;
    }
  });

  it('resolveCredentials with strategy=provided throws without explicit credentials', () => {
    expect(
      () =>
        new CognitoIdentityAdminAdapter({
          region: 'us-east-1',
          userPoolId: 'p',
          credentialsStrategy: 'provided',
        }),
    ).toThrow(IdentityAdminError);
  });

  it('resolveCredentials with strategy=provided + credentials accepts them', () => {
    expect(
      () =>
        new CognitoIdentityAdminAdapter({
          region: 'us-east-1',
          userPoolId: 'p',
          credentialsStrategy: 'provided',
          credentials: { accessKeyId: 'a', secretAccessKey: 's' },
        }),
    ).not.toThrow();
  });

  it('username fallback uses the configured order when Username is undefined', async () => {
    const send = vi.fn(async () => ({
      Username: undefined,
      Enabled: true,
      UserAttributes: [{ Name: 'email', Value: 'fallback@b' }],
    }));
    const adapter = makeAdapter(send);
    const result = await adapter.getUser('any');
    expect(result.username).toBe('fallback@b');
  });

  it('username fallback returns an empty string when no fallback attributes are present', async () => {
    const send = vi.fn(async () => ({
      Username: undefined,
      Enabled: false,
      UserAttributes: [{ Name: 'email', Value: '' }],
    }));
    const adapter = makeAdapter(send);
    await expect(adapter.getUser('any')).resolves.toMatchObject({ username: '' });
  });

  it('resolveCredentials with strategy=profile accepts explicit profile names', () => {
    expect(
      () =>
        new CognitoIdentityAdminAdapter({
          region: 'us-east-1',
          userPoolId: 'p',
          credentialsStrategy: 'profile',
          profile: 'unit-profile',
        }),
    ).not.toThrow();
  });

  it.each([
    ['getUser', (adapter: CognitoIdentityAdminAdapter) => adapter.getUser('alice')],
    ['updateUser', (adapter: CognitoIdentityAdminAdapter) => adapter.updateUser('alice', { email: 'a@b.test' })],
    ['disableUser', (adapter: CognitoIdentityAdminAdapter) => adapter.disableUser('alice')],
    ['enableUser', (adapter: CognitoIdentityAdminAdapter) => adapter.enableUser('alice')],
    ['listGroupsForUser', (adapter: CognitoIdentityAdminAdapter) => adapter.listGroupsForUser('alice')],
    ['listGroups', (adapter: CognitoIdentityAdminAdapter) => adapter.listGroups()],
    ['addUserToGroup', (adapter: CognitoIdentityAdminAdapter) => adapter.addUserToGroup('alice', 'admins')],
    ['removeUserFromGroup', (adapter: CognitoIdentityAdminAdapter) => adapter.removeUserFromGroup('alice', 'admins')],
    ['resetUserPassword', (adapter: CognitoIdentityAdminAdapter) => adapter.resetUserPassword('alice')],
    ['setUserPassword', (adapter: CognitoIdentityAdminAdapter) => adapter.setUserPassword('alice', 'pw')],
    ['verifyUserChannels', (adapter: CognitoIdentityAdminAdapter) => adapter.verifyUserChannels('alice', { email: true })],
  ])('%s maps provider failures to IdentityAdminError', async (_name, call) => {
    const send = vi.fn(async () => {
      throw { name: 'TooManyRequestsException', message: 'slow down' };
    });
    const adapter = makeAdapter(send);
    await expect(call(adapter)).rejects.toBeInstanceOf(IdentityAdminError);
  });
});

describe('buildCognitoAdminOptionsFromEnv', () => {
  it('reads region + userPoolId from environment', () => {
    const env: NodeJS.ProcessEnv = {
      COGNITO_REGION: 'us-west-2',
      COGNITO_USER_POOL_ID: 'pool-2',
    };
    const options = buildCognitoAdminOptionsFromEnv(env);
    expect(options.region).toBe('us-west-2');
    expect(options.userPoolId).toBe('pool-2');
  });

  it('falls back to AWS_REGION and AWS_DEFAULT_REGION', () => {
    expect(
      buildCognitoAdminOptionsFromEnv({ AWS_REGION: 'eu-west-1', COGNITO_USER_POOL_ID: 'p' }).region,
    ).toBe('eu-west-1');
    expect(
      buildCognitoAdminOptionsFromEnv({
        AWS_DEFAULT_REGION: 'eu-central-1',
        COGNITO_USER_POOL_ID: 'p',
      }).region,
    ).toBe('eu-central-1');
  });

  it('honors overrides over env', () => {
    const options = buildCognitoAdminOptionsFromEnv(
      { COGNITO_REGION: 'us-east-1', COGNITO_USER_POOL_ID: 'env-pool' },
      { region: 'sa-east-1', userPoolId: 'override-pool' },
    );
    expect(options.region).toBe('sa-east-1');
    expect(options.userPoolId).toBe('override-pool');
  });

  it('throws IDENTITY_VALIDATION_ERROR when region is missing', () => {
    expect(() =>
      buildCognitoAdminOptionsFromEnv({ COGNITO_USER_POOL_ID: 'p' }),
    ).toThrow(IdentityAdminError);
  });

  it('throws IDENTITY_VALIDATION_ERROR when userPoolId is missing', () => {
    expect(() =>
      buildCognitoAdminOptionsFromEnv({ COGNITO_REGION: 'us-east-1' }),
    ).toThrow(IdentityAdminError);
  });

  it('uses profile strategy when AWS_PROFILE is set', () => {
    const options = buildCognitoAdminOptionsFromEnv({
      COGNITO_REGION: 'us-east-1',
      COGNITO_USER_POOL_ID: 'p',
      AWS_PROFILE: 'my-profile',
    });
    expect(options.credentialsStrategy).toBe('profile');
    expect(options.profile).toBe('my-profile');
  });

  it('respects STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY env var', () => {
    const options = buildCognitoAdminOptionsFromEnv({
      COGNITO_REGION: 'us-east-1',
      COGNITO_USER_POOL_ID: 'p',
      STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY: 'default-chain',
    });
    expect(options.credentialsStrategy).toBe('default-chain');
  });

  it('includes endpoint, credentials, and fallback-order overrides when provided', () => {
    const credentials = { accessKeyId: 'a', secretAccessKey: 's' };
    const options = buildCognitoAdminOptionsFromEnv(
      { AWS_REGION: 'us-east-1', COGNITO_POOL_ID: 'p', COGNITO_IDP_ENDPOINT: 'http://localhost:4566' },
      {
        credentialsStrategy: 'provided',
        credentials,
        usernameAttributeFallbackOrder: ['sub'],
      },
    );
    expect(options).toMatchObject({
      region: 'us-east-1',
      userPoolId: 'p',
      endpoint: 'http://localhost:4566',
      credentialsStrategy: 'provided',
      credentials,
      usernameAttributeFallbackOrder: ['sub'],
    });
  });
});
