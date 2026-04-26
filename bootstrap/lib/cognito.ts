import {
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteGroupCommand,
  DeleteUserPoolClientCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
  GetGroupCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
  UpdateUserPoolClientCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import chalk from 'chalk';
import { baseAwsConfig, defaultTags, ensureDryRun, logAws } from './aws';

export interface CognitoEnsureInput {
  appName: string;
  frontendUrl: string;
  logoutUrl: string;
  region: string;
  profile?: string;
  dryRun?: boolean;
  debug?: boolean;
  userPoolName?: string;
  clientName?: string;
  force?: boolean;
}

export interface CognitoEnsureOutput {
  userPoolId: string;
  userPoolArn: string;
  appClientId: string;
  jwksUri: string;
}

const DEFAULT_GROUPS = ['admin', 'manager', 'viewer', 'ops'];

function client(ctx: CognitoEnsureInput) {
  return new CognitoIdentityProviderClient(baseAwsConfig({
    region: ctx.region,
    profile: ctx.profile,
    debug: ctx.debug,
    dryRun: ctx.dryRun,
    appName: ctx.appName,
  }));
}

async function findUserPoolId(cognito: CognitoIdentityProviderClient, poolName: string): Promise<string | undefined> {
  let token: string | undefined;
  do {
    const res = await cognito.send(new ListUserPoolsCommand({ MaxResults: 60, NextToken: token }));
    const match = res.UserPools?.find((pool) => pool.Name === poolName);
    if (match?.Id) {
      return match.Id;
    }
    token = res.NextToken ?? undefined;
  } while (token);
  return undefined;
}

async function ensureUserPool(ctx: CognitoEnsureInput): Promise<{ id: string; arn: string }> {
  const poolName = ctx.userPoolName ?? `${ctx.appName}-userpool`;
  const cognito = client(ctx);
  const existingId = await findUserPoolId(cognito, poolName);
  if (existingId) {
    const describe = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: existingId }));
    return { id: existingId, arn: describe.UserPool?.Arn ?? '' };
  }
  if (ensureDryRun({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `create user pool ${poolName}`)) {
    return { id: 'DRY_RUN_POOL', arn: 'arn:dry-run:pool' };
  }
  logAws({ region: ctx.region, profile: ctx.profile, debug: ctx.debug, dryRun: ctx.dryRun, appName: ctx.appName }, `creating user pool ${poolName}`);
  const res = await cognito.send(
    new CreateUserPoolCommand({
      PoolName: poolName,
      AutoVerifiedAttributes: ['email'],
      UserPoolTags: defaultTags(ctx.appName),
    }),
  );
  const id = res.UserPool?.Id;
  if (!id) {
    throw new Error('Failed to create Cognito User Pool');
  }
  return { id, arn: res.UserPool?.Arn ?? '' };
}

async function ensureUserPoolClient(ctx: CognitoEnsureInput, userPoolId: string): Promise<string> {
  const clientName = ctx.clientName ?? `${ctx.appName}-client`;
  const cognito = client(ctx);
  const list = await cognito.send(new ListUserPoolClientsCommand({ UserPoolId: userPoolId, MaxResults: 60 }));
  let existingClientId: string | undefined;
  if (list.UserPoolClients) {
    for (const item of list.UserPoolClients) {
      if (item.ClientName !== clientName || !item.ClientId) continue;
      const detail = await cognito.send(new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: item.ClientId }));
      if (detail.UserPoolClient?.ClientSecret) {
        const warning = `Cognito app client ${clientName} has a secret. stynx requires public clients (no secret).`;
        // eslint-disable-next-line no-console
        console.warn(chalk.red(warning));
        if (!ctx.force) {
          throw new Error(`${warning} Delete the existing client or re-run with --force.`);
        }
        continue;
      }
      existingClientId = detail.UserPoolClient?.ClientId;
      break;
    }
  }
  const redirectUrls = [ctx.frontendUrl, `${ctx.frontendUrl.replace(/\/$/, '')}/login/callback`];
  const logoutUrls = [ctx.logoutUrl || ctx.frontendUrl];
  if (existingClientId) {
    await cognito.send(
      new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: existingClientId,
        CallbackURLs: Array.from(new Set(redirectUrls)),
        LogoutURLs: Array.from(new Set(logoutUrls)),
        SupportedIdentityProviders: ['COGNITO'],
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthFlows: ['code', 'implicit'],
        AllowedOAuthScopes: ['email', 'openid', 'profile'],
        ExplicitAuthFlows: ['ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_USER_SRP_AUTH'],
      }),
    );
    return existingClientId;
  }
  if (ensureDryRun({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `create app client ${clientName}`)) {
    return 'DRY_RUN_CLIENT';
  }
  const res = await cognito.send(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: clientName,
      GenerateSecret: false,
      CallbackURLs: Array.from(new Set(redirectUrls)),
      LogoutURLs: Array.from(new Set(logoutUrls)),
      SupportedIdentityProviders: ['COGNITO'],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ['code', 'implicit'],
      AllowedOAuthScopes: ['email', 'openid', 'profile'],
      ExplicitAuthFlows: ['ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_USER_SRP_AUTH'],
    }),
  );
  if (!res.UserPoolClient?.ClientId) {
    throw new Error('Failed to create Cognito App Client');
  }
  return res.UserPoolClient.ClientId;
}

async function ensureGroups(ctx: CognitoEnsureInput, userPoolId: string, groups: string[] = DEFAULT_GROUPS): Promise<void> {
  const cognito = client(ctx);
  for (const name of groups) {
    try {
      await cognito.send(new GetGroupCommand({ GroupName: name, UserPoolId: userPoolId }));
    } catch (err: any) {
      if (String(err?.name) === 'ResourceNotFoundException') {
        if (ensureDryRun({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `create group ${name}`)) {
          continue;
        }
        await cognito.send(
          new CreateGroupCommand({
            GroupName: name,
            Description: `${ctx.appName} ${name} role`,
            UserPoolId: userPoolId,
          }),
        );
      } else {
        throw err;
      }
    }
  }
}

export async function ensureCognito(ctx: CognitoEnsureInput): Promise<CognitoEnsureOutput> {
  const pool = await ensureUserPool(ctx);
  const clientId = await ensureUserPoolClient(ctx, pool.id);
  await ensureGroups(ctx, pool.id);
  const jwksUri = `https://cognito-idp.${ctx.region}.amazonaws.com/${pool.id}/.well-known/jwks.json`;
  return {
    userPoolId: pool.id,
    userPoolArn: pool.arn,
    appClientId: clientId,
    jwksUri,
  };
}

export async function deleteUserPool(ctx: CognitoEnsureInput, userPoolId: string): Promise<void> {
  if (ensureDryRun({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `delete user pool ${userPoolId}`)) {
    return;
  }
  const cognito = client(ctx);
  await cognito.send(new DeleteUserPoolCommand({ UserPoolId: userPoolId }));
}

export async function deleteAppClient(ctx: CognitoEnsureInput, userPoolId: string, clientId: string): Promise<void> {
  if (ensureDryRun({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `delete app client ${clientId}`)) {
    return;
  }
  const cognito = client(ctx);
  await cognito.send(new DeleteUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: clientId }));
}

export async function deleteGroups(ctx: CognitoEnsureInput, userPoolId: string, groups: string[] = DEFAULT_GROUPS): Promise<void> {
  const cognito = client(ctx);
  for (const name of groups) {
    if (ensureDryRun({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `delete group ${name}`)) {
      continue;
    }
    try {
      await cognito.send(new DeleteGroupCommand({ GroupName: name, UserPoolId: userPoolId }));
    } catch (err: any) {
      if (String(err?.name) === 'ResourceNotFoundException') {
        logAws({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `group ${name} already deleted`);
      } else {
        throw err;
      }
    }
  }
}

export async function describeCognito(ctx: CognitoEnsureInput, userPoolId: string, clientId: string): Promise<CognitoEnsureOutput> {
  const cognito = client(ctx);
  const pool = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: userPoolId }));
  const clientInfo = await cognito.send(new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: clientId }));
  if (clientInfo.UserPoolClient?.ClientSecret) {
    const warning = `Cognito app client ${clientId} has a secret; remove it to keep the client public.`;
    // eslint-disable-next-line no-console
    console.warn(chalk.red(warning));
    if (!ctx.force) {
      throw new Error(`${warning} Re-run with --force to ignore temporarily.`);
    }
  }
  return {
    userPoolId,
    userPoolArn: pool.UserPool?.Arn ?? '',
    appClientId: clientId,
    jwksUri: `https://cognito-idp.${ctx.region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
  };
}
