import {
  AdminAddUserToGroupCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminGetUserCommandOutput,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListGroupsCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
  type AttributeType,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { fromIni } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';
import {
  IdentityAdminError,
  type IdentityAdminAdapter,
  type IdentityGroupSummary,
  type IdentityListGroupsResult,
  type IdentityListUsersQuery,
  type IdentityListUsersResult,
  type IdentityUpdateUserRequest,
  type IdentityUserDetail,
  type IdentityUserSummary,
  type IdentityVerifyChannelsRequest,
} from '@stynx/contracts';

export type CognitoAdminCredentialStrategy = 'default-chain' | 'profile' | 'provided';

export interface CognitoAdminAdapterOptions {
  region: string;
  userPoolId: string;
  endpoint?: string;
  credentialsStrategy?: CognitoAdminCredentialStrategy;
  profile?: string;
  credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider;
  usernameAttributeFallbackOrder?: string[];
}

export interface CognitoAdminOptionsFromEnvOverrides {
  region?: string;
  userPoolId?: string;
  endpoint?: string;
  credentialsStrategy?: CognitoAdminCredentialStrategy;
  profile?: string;
  credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider;
  usernameAttributeFallbackOrder?: string[];
}

const DEFAULT_USERNAME_FALLBACK_ORDER = ['email', 'preferred_username', 'phone_number', 'sub'];

function toIso(value: Date | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function userAttributesToRecord(attributes: AttributeType[] | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  for (const attr of attributes ?? []) {
    if (attr.Name) record[attr.Name] = attr.Value ?? '';
  }
  return record;
}

export function mapCognitoError(error: unknown): IdentityAdminError {
  const e = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const name = e?.name ?? 'UnknownError';
  const message = e?.message ?? 'Identity provider operation failed';

  if (name === 'UserNotFoundException' || name === 'ResourceNotFoundException') {
    return new IdentityAdminError('IDENTITY_NOT_FOUND', message, { providerErrorName: name });
  }
  if (name === 'NotAuthorizedException' || name === 'AccessDeniedException') {
    return new IdentityAdminError('IDENTITY_FORBIDDEN', message, { providerErrorName: name });
  }
  if (name === 'UsernameExistsException' || name === 'AliasExistsException') {
    return new IdentityAdminError('IDENTITY_CONFLICT', message, { providerErrorName: name });
  }
  if (name === 'TooManyRequestsException') {
    return new IdentityAdminError('IDENTITY_RATE_LIMITED', message, { providerErrorName: name });
  }
  if (name === 'InvalidParameterException' || name === 'InvalidPasswordException') {
    return new IdentityAdminError('IDENTITY_VALIDATION_ERROR', message, { providerErrorName: name });
  }

  return new IdentityAdminError('IDENTITY_PROVIDER_ERROR', message, {
    providerErrorName: name,
    httpStatusCode: e?.$metadata?.httpStatusCode,
  });
}

export class CognitoIdentityAdminAdapter implements IdentityAdminAdapter {
  private readonly client: CognitoIdentityProviderClient;
  private readonly usernameAttributeFallbackOrder: string[];

  constructor(private readonly options: CognitoAdminAdapterOptions) {
    const credentials = this.resolveCredentials(options);
    this.client = new CognitoIdentityProviderClient({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(credentials ? { credentials } : {}),
    });
    this.usernameAttributeFallbackOrder =
      options.usernameAttributeFallbackOrder ?? DEFAULT_USERNAME_FALLBACK_ORDER;
  }

  async listUsers(query: IdentityListUsersQuery): Promise<IdentityListUsersResult> {
    try {
      const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 60) : undefined;

      if (query.group) {
        const response = await this.client.send(
          new ListUsersInGroupCommand({
            UserPoolId: this.options.userPoolId,
            GroupName: query.group,
            Limit: limit,
            NextToken: query.token,
          }),
        );
        return {
          items: (response.Users ?? []).map((u) => this.toSummary(u)),
          ...(response.NextToken ? { nextToken: response.NextToken } : {}),
        };
      }

      const filter = query.email
        ? `email ^= "${query.email}"`
        : query.phone
          ? `phone_number ^= "${query.phone}"`
          : undefined;

      const response = await this.client.send(
        new ListUsersCommand({
          UserPoolId: this.options.userPoolId,
          Filter: filter,
          Limit: limit,
          PaginationToken: query.token,
        }),
      );

      return {
        items: (response.Users ?? []).map((u) => this.toSummary(u)),
        ...(response.PaginationToken ? { nextToken: response.PaginationToken } : {}),
      };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async getUser(username: string): Promise<IdentityUserDetail> {
    try {
      const response = await this.client.send(
        new AdminGetUserCommand({
          UserPoolId: this.options.userPoolId,
          Username: username,
        }),
      );
      return this.toDetail(response);
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async getUserBySubject(subject: string): Promise<IdentityUserDetail> {
    try {
      const response = await this.client.send(
        new ListUsersCommand({
          UserPoolId: this.options.userPoolId,
          Filter: `sub = "${subject}"`,
          Limit: 1,
        }),
      );
      const user = response.Users?.[0];
      if (!user?.Username) {
        throw new IdentityAdminError('IDENTITY_NOT_FOUND', 'Cognito user not found by subject', { subject });
      }
      return this.getUser(user.Username);
    } catch (error) {
      if (error instanceof IdentityAdminError) throw error;
      throw mapCognitoError(error);
    }
  }

  async updateUser(username: string, request: IdentityUpdateUserRequest): Promise<IdentityUserDetail> {
    const attributes: AttributeType[] = [];
    if (request.email !== undefined) attributes.push({ Name: 'email', Value: request.email });
    if (request.phoneNumber !== undefined) {
      attributes.push({ Name: 'phone_number', Value: request.phoneNumber });
    }
    if (request.name !== undefined) attributes.push({ Name: 'name', Value: request.name });
    if (request.givenName !== undefined) {
      attributes.push({ Name: 'given_name', Value: request.givenName });
    }
    if (request.familyName !== undefined) {
      attributes.push({ Name: 'family_name', Value: request.familyName });
    }

    for (const [key, value] of Object.entries(request.custom ?? {})) {
      attributes.push({ Name: `custom:${key}`, Value: value });
    }

    try {
      if (attributes.length > 0) {
        await this.client.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: this.options.userPoolId,
            Username: username,
            UserAttributes: attributes,
          }),
        );
      }
      return this.getUser(username);
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async disableUser(username: string): Promise<void> {
    try {
      await this.client.send(
        new AdminDisableUserCommand({
          UserPoolId: this.options.userPoolId,
          Username: username,
        }),
      );
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async enableUser(username: string): Promise<void> {
    try {
      await this.client.send(
        new AdminEnableUserCommand({
          UserPoolId: this.options.userPoolId,
          Username: username,
        }),
      );
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async listGroupsForUser(username: string): Promise<IdentityGroupSummary[]> {
    try {
      const response = await this.client.send(
        new AdminListGroupsForUserCommand({
          UserPoolId: this.options.userPoolId,
          Username: username,
        }),
      );
      return (response.Groups ?? [])
        .filter((group) => typeof group.GroupName === 'string' && group.GroupName.length > 0)
        .map((group) => ({
          name: group.GroupName!,
          ...(group.Description ? { description: group.Description } : {}),
        }));
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async listGroups(query: { limit?: number; token?: string } = {}): Promise<IdentityListGroupsResult> {
    try {
      const response = await this.client.send(
        new ListGroupsCommand({
          UserPoolId: this.options.userPoolId,
          Limit: query.limit,
          NextToken: query.token,
        }),
      );
      return {
        items: (response.Groups ?? [])
          .filter((group) => typeof group.GroupName === 'string' && group.GroupName.length > 0)
          .map((group) => ({
            name: group.GroupName!,
            ...(group.Description ? { description: group.Description } : {}),
          })),
        ...(response.NextToken ? { nextToken: response.NextToken } : {}),
      };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async addUserToGroup(username: string, groupName: string): Promise<void> {
    try {
      await this.client.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: this.options.userPoolId,
          Username: username,
          GroupName: groupName,
        }),
      );
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async removeUserFromGroup(username: string, groupName: string): Promise<void> {
    try {
      await this.client.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: this.options.userPoolId,
          Username: username,
          GroupName: groupName,
        }),
      );
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async resetUserPassword(username: string): Promise<void> {
    try {
      await this.client.send(
        new AdminResetUserPasswordCommand({
          UserPoolId: this.options.userPoolId,
          Username: username,
        }),
      );
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async setUserPassword(username: string, newPassword: string, permanent = true): Promise<void> {
    try {
      await this.client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.options.userPoolId,
          Username: username,
          Password: newPassword,
          Permanent: permanent,
        }),
      );
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async verifyUserChannels(username: string, request: IdentityVerifyChannelsRequest): Promise<void> {
    const attributes: AttributeType[] = [];
    if (request.email) attributes.push({ Name: 'email_verified', Value: 'true' });
    if (request.phone) attributes.push({ Name: 'phone_number_verified', Value: 'true' });

    try {
      if (attributes.length > 0) {
        await this.client.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: this.options.userPoolId,
            Username: username,
            UserAttributes: attributes,
          }),
        );
      }
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  private toSummary(user: UserType): IdentityUserSummary {
    const attributes = userAttributesToRecord(user.Attributes);
    const status = user.UserStatus;
    const createdAt = toIso(user.UserCreateDate);
    const updatedAt = toIso(user.UserLastModifiedDate);
    const email = attributes.email;
    const phoneNumber = attributes.phone_number;

    return {
      username: user.Username ?? this.resolveUsernameFallback(attributes),
      enabled: Boolean(user.Enabled),
      ...(status ? { status } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      ...(email ? { email } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
    };
  }

  private toDetail(user: AdminGetUserCommandOutput): IdentityUserDetail {
    const attributes = userAttributesToRecord(user.UserAttributes);
    const status = user.UserStatus;
    const createdAt = toIso(user.UserCreateDate);
    const updatedAt = toIso(user.UserLastModifiedDate);
    const email = attributes.email;
    const phoneNumber = attributes.phone_number;

    return {
      username: user.Username ?? this.resolveUsernameFallback(attributes),
      enabled: Boolean(user.Enabled),
      ...(status ? { status } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      ...(email ? { email } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
      attributes,
    };
  }

  private resolveUsernameFallback(attributes: Record<string, string>): string {
    for (const key of this.usernameAttributeFallbackOrder) {
      const value = attributes[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
    return '';
  }

  private resolveCredentials(
    options: CognitoAdminAdapterOptions,
  ): AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined {
    const strategy = options.credentialsStrategy ?? 'default-chain';

    if (strategy === 'default-chain') {
      return undefined;
    }

    if (strategy === 'profile') {
      const profile = options.profile ?? process.env.AWS_PROFILE;
      if (!profile) {
        throw new IdentityAdminError(
          'IDENTITY_VALIDATION_ERROR',
          'Profile credentials strategy requires profile name',
          { expected: 'options.profile or AWS_PROFILE' },
        );
      }
      return fromIni({ profile });
    }

    if (!options.credentials) {
      throw new IdentityAdminError(
        'IDENTITY_VALIDATION_ERROR',
        'Provided credentials strategy requires explicit credentials',
      );
    }
    return options.credentials;
  }
}

export function buildCognitoAdminOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: CognitoAdminOptionsFromEnvOverrides = {},
): CognitoAdminAdapterOptions {
  const region =
    overrides.region ??
    env.COGNITO_REGION ??
    env.AWS_REGION ??
    env.AWS_DEFAULT_REGION ??
    '';
  const userPoolId =
    overrides.userPoolId ??
    env.COGNITO_USER_POOL_ID ??
    env.COGNITO_POOL_ID ??
    '';
  const endpoint = overrides.endpoint ?? env.COGNITO_IDP_ENDPOINT ?? undefined;

  if (!region) {
    throw new IdentityAdminError(
      'IDENTITY_VALIDATION_ERROR',
      'Missing Cognito admin region configuration',
      { expectedEnv: ['COGNITO_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION'] },
    );
  }
  if (!userPoolId) {
    throw new IdentityAdminError(
      'IDENTITY_VALIDATION_ERROR',
      'Missing Cognito user pool id configuration',
      { expectedEnv: ['COGNITO_USER_POOL_ID', 'COGNITO_POOL_ID'] },
    );
  }

  const credentialsStrategy =
    overrides.credentialsStrategy ??
    (env.STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY as CognitoAdminCredentialStrategy | undefined) ??
    (env.AWS_PROFILE ? 'profile' : 'default-chain');

  const profile = overrides.profile ?? env.STYNX_IDENTITY_ADMIN_AWS_PROFILE ?? env.AWS_PROFILE;

  return {
    region,
    userPoolId,
    credentialsStrategy,
    ...(endpoint ? { endpoint } : {}),
    ...(credentialsStrategy === 'profile' && profile ? { profile } : {}),
    ...(overrides.credentials ? { credentials: overrides.credentials } : {}),
    ...(overrides.usernameAttributeFallbackOrder
      ? { usernameAttributeFallbackOrder: overrides.usernameAttributeFallbackOrder }
      : {}),
  };
}
