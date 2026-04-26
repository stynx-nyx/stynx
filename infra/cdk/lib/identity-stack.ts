import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import type { EnvConfig } from './config';

export class IdentityStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly apiClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: StackProps & { config: EnvConfig }) {
    super(scope, id, props);

    const { config } = props;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `stynx-${config.env}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: config.env === 'prod' ? cognito.Mfa.OPTIONAL : cognito.Mfa.OFF,
      passwordPolicy: {
        minLength: 14,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      standardThreatProtectionMode: config.env === 'prod'
        ? cognito.StandardThreatProtectionMode.FULL_FUNCTION
        : cognito.StandardThreatProtectionMode.AUDIT_ONLY,
      customAttributes: {
        locale: new cognito.StringAttribute({
          minLen: 2,
          maxLen: 10,
        }),
      },
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.apiClient = this.userPool.addClient('SpaClient', {
      userPoolClientName: `stynx-${config.env}-spa`,
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [`https://${config.domain}/auth/callback`],
        logoutUrls: [`https://${config.domain}/auth/logout`],
      },
      refreshTokenValidity: Duration.days(30),
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      preventUserExistenceErrors: true,
    });

    this.userPool.addClient('AdminClient', {
      userPoolClientName: `stynx-${config.env}-admin`,
      generateSecret: true,
      authFlows: {
        adminUserPassword: true,
      },
    });
  }
}
