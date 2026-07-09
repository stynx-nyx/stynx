# STYNX — AWS Infrastructure Skeleton (CDK)

&gt; AWS CDK (TypeScript) reference stack for a STYNX‑based application's environment. Paired with STYNX‑SPEC §2 (architecture), §4.1 (tenancy topology), §8 (storage), §11 (observability), §17/§18 (configuration).

**Status:** Normative reference. Each consumer app duplicates &amp; customizes this skeleton under `infra/` in its own repo. The STYNX platform publishes a thin `@stynx-nyx/cdk` package exposing L3 constructs that wrap the raw CDK, so most consumers write ~150 lines of stack code total.

**Targets:** one AWS account per environment (`dev`, `stage`, `prod`), region fixed at install (default `sa-east-1`).

---

## 1. Stack composition

The full environment is one CDK app, seven stacks, deployed in order:

```
┌────────────────────────────┐
│ 1. NetworkStack            │  VPC, subnets, NAT, endpoints
└──────────────┬─────────────┘
               │
┌──────────────┴─────────────┐
│ 2. IdentityStack           │  Cognito User Pool + clients
└────────────────────────────┘

┌────────────────────────────┐
│ 3. DataStack               │  RDS PostgreSQL, ElastiCache Redis, PgBouncer
└──────────────┬─────────────┘
               │
┌──────────────┴─────────────┐
│ 4. StorageStack            │  S3 buckets, KMS keys, lifecycle rules
└────────────────────────────┘

┌────────────────────────────┐
│ 5. ComputeStack            │  ECS Fargate service(s), ALB, regional WAF, ACM
└──────────────┬─────────────┘
               │
┌──────────────┴─────────────┐
│ 6. EdgeStack               │  CloudFront, global WAF, us-east-1 ACM, DNS aliases
└──────────────┬─────────────┘
               │
┌──────────────┴─────────────┐
│ 7. ObservabilityStack      │  Log groups, AMP, AMG, alarms, dashboards
└────────────────────────────┘
```

Inter‑stack references are via CDK cross‑stack imports (CloudFormation exports). No manual ARN wiring.

---

## 2. App entry point

```typescript
// infra/bin/stynx-env.ts
import { App, Tags } from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { IdentityStack } from '../lib/identity-stack';
import { DataStack } from '../lib/data-stack';
import { StorageStack } from '../lib/storage-stack';
import { ComputeStack } from '../lib/compute-stack';
import { EdgeStack } from '../lib/edge-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { loadEnvConfig } from '../lib/config';

const app = new App();

// Environment selection via context: `cdk deploy -c env=stage`
const envName = app.node.tryGetContext('env') as 'dev' | 'stage' | 'prod';
if (!['dev', 'stage', 'prod'].includes(envName)) {
  throw new Error(`Invalid env: ${envName}. Expected one of: dev, stage, prod`);
}

const cfg = loadEnvConfig(envName); // reads infra/config/{env}.ts
const awsEnv = { account: cfg.accountId, region: cfg.region };

const network = new NetworkStack(app, `stynx-${envName}-network`, {
  env: awsEnv,
  config: cfg,
});

const identity = new IdentityStack(app, `stynx-${envName}-identity`, {
  env: awsEnv,
  config: cfg,
});

const data = new DataStack(app, `stynx-${envName}-data`, {
  env: awsEnv,
  config: cfg,
  vpc: network.vpc,
});

const storage = new StorageStack(app, `stynx-${envName}-storage`, {
  env: awsEnv,
  config: cfg,
});

const compute = new ComputeStack(app, `stynx-${envName}-compute`, {
  env: awsEnv,
  crossRegionReferences: true,
  config: cfg,
  vpc: network.vpc,
  dbSecret: data.dbSecret,
  dbEndpoint: data.pgBouncerEndpoint,
  redisEndpoint: data.redisEndpoint,
  userPoolId: identity.userPool.userPoolId,
  userPoolClientId: identity.apiClient.userPoolClientId,
  docsBucket: storage.docsBucket,
  kmsDocsKey: storage.kmsDocsKey,
});

const edge = new EdgeStack(app, `stynx-${envName}-edge`, {
  env: { account: cfg.accountId, region: 'us-east-1' },
  crossRegionReferences: true,
  config: cfg,
  alb: compute.alb,
});

const observability = new ObservabilityStack(app, `stynx-${envName}-observability`, {
  env: awsEnv,
  config: cfg,
  alb: compute.alb,
  ecsService: compute.service,
  db: data.db,
  redis: data.redis,
});

// Every resource tagged for cost attribution and governance.
for (const stack of [network, identity, data, storage, compute, edge, observability]) {
  Tags.of(stack).add('stynx:env', envName);
  Tags.of(stack).add('stynx:managed', 'true');
  Tags.of(stack).add('stynx:owner', cfg.ownerTeam);
}

app.synth();
```

Per‑environment config lives in versioned TypeScript files:

```typescript
// infra/config/prod.ts
export const prod = {
  accountId: '111122223333',
  region: 'sa-east-1',
  ownerTeam: 'platform',
  domain: 'api.example.com',

  vpc: {
    cidr: '10.20.0.0/16',
    maxAzs: 3,
  },

  db: {
    instanceClass: 'db.r6g.xlarge',
    storageGb: 500,
    multiAz: true,
    backupRetentionDays: 30,
    pgVersion: '16.3',
  },

  redis: {
    nodeType: 'cache.r6g.large',
    replicasPerNodeGroup: 1,
  },

  ecs: {
    cpu: 2048,
    memory: 4096,
    desiredCount: 3,
    minCapacity: 3,
    maxCapacity: 20,
    // ...
  },
};
```

---

## 3. NetworkStack

Standard three‑tier VPC. Private subnets for app + data. Public subnets for the ALB only. NAT gateways for egress (one per AZ in prod; single NAT in dev for cost).

```typescript
// infra/lib/network-stack.ts
import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import {
  Vpc,
  SubnetType,
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpointAwsService,
  FlowLogDestination,
  FlowLogTrafficType,
} from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvConfig } from './config';

export class NetworkStack extends Stack {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: StackProps & { config: EnvConfig }) {
    super(scope, id, props);
    const { config } = props;

    this.vpc = new Vpc(this, 'Vpc', {
      ipAddresses: { cidrBlock: config.vpc.cidr } as any,
      maxAzs: config.vpc.maxAzs,
      natGateways: config.env === 'prod' ? config.vpc.maxAzs : 1,
      subnetConfiguration: [
        { name: 'public', subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'data', subnetType: SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // Gateway endpoints (free) for S3 and DynamoDB
    this.vpc.addGatewayEndpoint('S3Endpoint', { service: GatewayVpcEndpointAwsService.S3 });

    // Interface endpoints (metered) for private AWS API access
    for (const svc of [
      InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      InterfaceVpcEndpointAwsService.KMS,
      InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      InterfaceVpcEndpointAwsService.ECR,
      InterfaceVpcEndpointAwsService.ECR_DOCKER,
    ]) {
      this.vpc.addInterfaceEndpoint(`Endpoint-${svc.shortName}`, {
        service: svc,
        privateDnsEnabled: true,
      });
    }

    // VPC Flow Logs to CloudWatch
    const flowLogGroup = new LogGroup(this, 'FlowLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    this.vpc.addFlowLog('FlowLog', {
      destination: FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: FlowLogTrafficType.ALL,
    });
  }
}
```

**Notes:**

- Three subnet tiers: public (ALB), private‑with‑egress (app pods), isolated (RDS, Redis). Strict separation — the data tier has no default route to the internet.
- Interface endpoints avoid egress for AWS API calls (Secrets Manager, KMS, CloudWatch, ECR). Cuts NAT cost and keeps traffic inside AWS.
- Flow logs retained for one month — sufficient for incident investigation without exploding CWL cost.

---

## 4. IdentityStack

Single Cognito User Pool per environment (STYNX‑SPEC §4.1). One app client for the SPA (PKCE), one for Lambda / admin backchannel (client secret). SAML federation stub wired in CI but can stay a placeholder in prod until needed.

```typescript
// infra/lib/identity-stack.ts
import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  UserPool,
  UserPoolClient,
  OAuthScope,
  AccountRecovery,
  AdvancedSecurityMode,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { EnvConfig } from './config';

export class IdentityStack extends Stack {
  public readonly userPool: UserPool;
  public readonly apiClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: StackProps & { config: EnvConfig }) {
    super(scope, id, props);
    const { config } = props;

    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: `stynx-${config.env}`,
      selfSignUpEnabled: false, // platform-ops provisioning only (SPEC §4.5)
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: config.env === 'prod' ? ('optional' as any) : ('off' as any),
      passwordPolicy: {
        minLength: 14,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      advancedSecurityMode:
        config.env === 'prod' ? AdvancedSecurityMode.ENFORCED : AdvancedSecurityMode.AUDIT,
      customAttributes: {
        // NO tenant_id here — tenancy lives in the STYNX DB, not in Cognito (SPEC §5.1).
        // Keep locale as a user preference.
        locale: { minLen: 2, maxLen: 10 } as any,
      },
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.apiClient = this.userPool.addClient('SpaClient', {
      userPoolClientName: `stynx-${config.env}-spa`,
      generateSecret: false, // PKCE — no client secret for SPA
      authFlows: { userPassword: false, userSrp: true, adminUserPassword: false },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [`https://${config.domain}/auth/callback`],
        logoutUrls: [`https://${config.domain}/auth/logout`],
      },
      refreshTokenValidity: Duration.days(30),
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      preventUserExistenceErrors: true,
    });

    // Admin / backchannel client (e.g., for Lambda-based user provisioning)
    this.userPool.addClient('AdminClient', {
      userPoolClientName: `stynx-${config.env}-admin`,
      generateSecret: true,
      authFlows: { adminUserPassword: true },
    });

    // SAML federation placeholder — filled per-tenant at provisioning time.
    // In CI we attach a stub IdP (samltest.id) to exercise the federation path
    // (SPEC §5.2, Q13 resolved).
  }
}
```

**Notes:**

- `signInAliases: &#123; email: true &#125;` matches `auth.users.email` which is the STYNX side's primary user handle.
- Self‑signup disabled — tenant admins provision users via STYNX's API, which calls Cognito admin endpoints via the `AdminClient`.
- Advanced security enforced in prod (impossible‑travel detection, compromised‑credential check). Audit‑only in lower envs to keep friction down.
- Per STYNX‑SPEC §5.1, no `custom:tenant_id` attribute. Tenant membership is in our DB.

---

## 5. DataStack

RDS PostgreSQL (Multi‑AZ in prod), PgBouncer (transaction mode) as a Fargate service, ElastiCache Redis (cluster mode with replication group), all in isolated subnets.

```typescript
// infra/lib/data-stack.ts
import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
  Credentials,
  StorageType,
} from 'aws-cdk-lib/aws-rds';
import {
  InstanceType,
  InstanceClass,
  InstanceSize,
  SubnetType,
  Port,
  Peer,
  SecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import { Cluster, FargateService, ContainerImage, LogDrivers } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  CfnReplicationGroup,
  CfnSubnetGroup,
  CfnParameterGroup,
} from 'aws-cdk-lib/aws-elasticache';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvConfig } from './config';

interface DataStackProps extends StackProps {
  config: EnvConfig;
  vpc: Vpc;
}

export class DataStack extends Stack {
  public readonly db: DatabaseInstance;
  public readonly dbSecret: Secret;
  public readonly pgBouncerEndpoint: string;
  public readonly redis: CfnReplicationGroup;
  public readonly redisEndpoint: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config, vpc } = props;

    // -- Postgres ---------------------------------------------------------
    const dbSg = new SecurityGroup(this, 'DbSg', { vpc, description: 'RDS Postgres' });

    this.dbSecret = new Secret(this, 'DbMasterSecret', {
      secretName: `stynx/${config.env}/db/master`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'stynx_owner' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 40,
      },
    });

    this.db = new DatabaseInstance(this, 'Postgres', {
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.of(config.db.pgVersion, '16'),
      }),
      instanceType: new InstanceType(config.db.instanceClass),
      credentials: Credentials.fromSecret(this.dbSecret),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      multiAz: config.db.multiAz,
      allocatedStorage: config.db.storageGb,
      storageType: StorageType.GP3,
      storageEncrypted: true,
      backupRetention: Duration.days(config.db.backupRetentionDays),
      deleteAutomatedBackups: config.env !== 'prod',
      deletionProtection: config.env === 'prod',
      performanceInsightRetention: config.env === 'prod' ? 731 : 7,
      cloudwatchLogsExports: ['postgresql'],
      parameters: {
        log_min_duration_statement: '500', // slow query log > 500ms
        log_connections: 'on',
        log_disconnections: 'on',
        shared_preload_libraries: 'pg_stat_statements',
        'pg_stat_statements.track': 'all',
        // Row-level security enforcement tightened
        row_security: 'on',
      },
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.SNAPSHOT,
    });

    // -- Secrets Manager rotation (monthly) -------------------------------
    this.dbSecret.addRotationSchedule('Rotate', {
      automaticallyAfter: Duration.days(30),
      hostedRotation: { type: 'PostgreSQLSingleUser' } as any,
    });

    // -- PgBouncer as Fargate service -------------------------------------
    const pbCluster = new Cluster(this, 'PgBouncerCluster', { vpc, containerInsights: true });

    const pbSg = new SecurityGroup(this, 'PgBouncerSg', { vpc, description: 'PgBouncer' });
    pbSg.connections.allowTo(dbSg, Port.tcp(5432));
    dbSg.connections.allowFrom(pbSg, Port.tcp(5432));

    // Image is a pinned PgBouncer build published by the platform team.
    // Transaction pooling, default_pool_size = 20, max_client_conn = 1000 (see SPEC §13.1).
    const pbService = new FargateService(this, 'PgBouncerService', {
      cluster: pbCluster,
      desiredCount: config.env === 'prod' ? 2 : 1,
      taskDefinition: buildPgBouncerTaskDefinition(this, config, this.dbSecret, this.db),
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [pbSg],
    });

    // Internal NLB for PgBouncer, or Cloud Map service discovery.
    // Using Cloud Map keeps the hop fewer and avoids another LB to manage.
    // (elided for space — see @stynx-nyx/cdk package for the full construct.)
    this.pgBouncerEndpoint = `pgbouncer.${config.env}.stynx.internal:5432`;

    // -- ElastiCache Redis ------------------------------------------------
    const redisSg = new SecurityGroup(this, 'RedisSg', { vpc, description: 'Redis' });

    const redisSubnetGroup = new CfnSubnetGroup(this, 'RedisSubnets', {
      cacheSubnetGroupName: `stynx-${config.env}-redis`,
      subnetIds: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_ISOLATED }).subnetIds,
      description: 'STYNX Redis subnet group',
    });

    const redisParams = new CfnParameterGroup(this, 'RedisParams', {
      cacheParameterGroupFamily: 'redis7',
      description: 'STYNX Redis params',
      properties: {
        'notify-keyspace-events': 'Ex', // key expiry notifications for session cleanup
        'maxmemory-policy': 'volatile-lru',
      },
    });

    this.redis = new CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: `STYNX ${config.env} Redis`,
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: config.redis.nodeType,
      numNodeGroups: 1,
      replicasPerNodeGroup: config.redis.replicasPerNodeGroup,
      automaticFailoverEnabled: config.env === 'prod',
      multiAzEnabled: config.env === 'prod',
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      cacheParameterGroupName: redisParams.ref,
      securityGroupIds: [redisSg.securityGroupId],
      snapshotRetentionLimit: config.env === 'prod' ? 7 : 1,
    });

    this.redisEndpoint = this.redis.attrPrimaryEndPointAddress;
  }
}

// buildPgBouncerTaskDefinition: elided. Builds a TaskDefinition from the
// team's pinned PgBouncer container image, reading DB creds from Secrets Manager
// and writing userlist.txt + pgbouncer.ini into an EFS-backed config volume or
// via environment substitution at container start. See @stynx-nyx/cdk source.
```

**Notes:**

- `stynx_app` and `stynx_reader` roles are created inside Postgres by STYNX's bootstrap migration, not by CDK. The `stynx_owner` password is the only credential provisioned here.
- `row_security = on` is a belt‑and‑braces; the app connections always use `stynx_app` which is subject to RLS regardless.
- PgBouncer on Fargate (not sidecar): one central pooler per environment, two instances in prod for redundancy. Sidecar‑per‑pod is an alternative if connection fan‑out is tight; the central form is simpler for tenant scale in scope.
- Redis with transit + at‑rest encryption is standard. `notify-keyspace-events Ex` is used by `@stynx-nyx/sessions` to observe session expiry.
- Parameter rotation monthly (DB) and via STYNX's in‑app scheduler (Cognito client secrets, STYNX signing keys per §18.2).

---

## 6. StorageStack

Single bucket per environment (STYNX‑SPEC §8.1). KMS CMK. Versioning, block public access, lifecycle rules.

```typescript
// infra/lib/storage-stack.ts
import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  Bucket,
  BucketEncryption,
  BlockPublicAccess,
  ObjectOwnership,
  StorageClass,
  LifecycleRule,
} from 'aws-cdk-lib/aws-s3';
import { Key, KeySpec, KeyUsage } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvConfig } from './config';

export class StorageStack extends Stack {
  public readonly docsBucket: Bucket;
  public readonly kmsDocsKey: Key;

  constructor(scope: Construct, id: string, props: StackProps & { config: EnvConfig }) {
    super(scope, id, props);
    const { config } = props;

    this.kmsDocsKey = new Key(this, 'DocsKey', {
      alias: `alias/stynx-docs-${config.env}`,
      description: 'STYNX document storage KMS CMK',
      enableKeyRotation: true,
      keySpec: KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: KeyUsage.ENCRYPT_DECRYPT,
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const lifecycle: LifecycleRule[] = [
      {
        id: 'transition-ia',
        enabled: true,
        transitions: [
          { storageClass: StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(30) },
        ],
      },
      {
        id: 'transition-glacier-ir',
        enabled: true,
        transitions: [
          {
            storageClass: StorageClass.GLACIER_INSTANT_RETRIEVAL,
            transitionAfter: Duration.days(180),
          },
        ],
      },
      {
        id: 'transition-deep-archive',
        enabled: true,
        transitions: [
          { storageClass: StorageClass.DEEP_ARCHIVE, transitionAfter: Duration.days(730) },
        ],
      },
      {
        id: 'expire-noncurrent',
        enabled: true,
        noncurrentVersionExpiration: Duration.days(90),
      },
      {
        id: 'expire-incomplete-uploads',
        enabled: true,
        abortIncompleteMultipartUploadAfter: Duration.days(7),
      },
    ];

    this.docsBucket = new Bucket(this, 'DocsBucket', {
      bucketName: `stynx-docs-${config.env}-${config.region.replace(/-/g, '')}`,
      versioned: true,
      encryption: BucketEncryption.KMS,
      encryptionKey: this.kmsDocsKey,
      bucketKeyEnabled: true, // cheaper KMS ops
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      lifecycleRules: lifecycle,
      eventBridgeEnabled: true, // future: hook for virus scanning (§24/E8)
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: config.env !== 'prod',
    });

    // (Audit archive bucket — separate, longer retention, deep-archive heavy —
    //  elided; follows the same pattern with different lifecycle timings.)
  }
}
```

**Notes:**

- Single shared bucket per environment (STYNX‑SPEC §4.1 decision). Per‑tenant prefix is enforced in `@stynx-nyx/storage` at presign time.
- Lifecycle: IA at 30d, Glacier IR at 180d, Deep Archive at 730d, noncurrent version expire at 90d. Matches SPEC §8.1.
- `eventBridgeEnabled: true` is the hook for when §24/E8 (document scanning) ships.
- `BUCKET_OWNER_ENFORCED` + block‑public‑access + enforce‑SSL is the hardened default.

---

## 7. ComputeStack

ECS Fargate service behind an ALB. WAF in front. ACM cert managed separately (issued with DNS validation, referenced by ARN from config).

```typescript
// infra/lib/compute-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Cluster, FargateService, FargateTaskDefinition, ContainerImage,
         LogDrivers, Secret as EcsSecret } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer, ApplicationListener, ApplicationProtocol,
         ListenerCondition, ListenerAction } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { CfnWebACL, CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvConfig } from './config';

// ... (props typing elided for space)

export class ComputeStack extends Stack {
  public readonly alb: ApplicationLoadBalancer;
  public readonly service: FargateService;

  constructor(scope: Construct, id: string, props: /*...*/) {
    super(scope, id, props);
    const { config, vpc, dbSecret, dbEndpoint, redisEndpoint,
            userPoolId, userPoolClientId, docsBucket, kmsDocsKey } = props;

    // -- Log group ------------------------------------------------------
    const logGroup = new LogGroup(this, 'AppLogs', {
      logGroupName: `/aws/ecs/stynx-${config.env}`,
      retention: config.env === 'prod' ? RetentionDays.SIX_MONTHS : RetentionDays.ONE_MONTH,
    });

    // -- Cluster --------------------------------------------------------
    const cluster = new Cluster(this, 'AppCluster', {
      vpc, containerInsights: true,
      clusterName: `stynx-${config.env}`,
    });

    // -- Task definition ------------------------------------------------
    const taskDef = new FargateTaskDefinition(this, 'AppTask', {
      cpu: config.ecs.cpu, memoryLimitMiB: config.ecs.memory,
    });

    taskDef.addContainer('app', {
      image: ContainerImage.fromEcrRepository(/* repo */, /* tag from CI */),
      essential: true,
      logging: LogDrivers.awsLogs({ streamPrefix: 'app', logGroup }),
      environment: {
        NODE_ENV:     config.env,
        AWS_REGION:   config.region,
        STYNX_ENV:    config.env,
        PGBOUNCER_HOST: dbEndpoint,
        REDIS_URL:    `rediss://${redisEndpoint}:6379`,
        COGNITO_USER_POOL_ID:    userPoolId,
        COGNITO_CLIENT_ID:       userPoolClientId,
        DOCS_BUCKET:             docsBucket.bucketName,
        KMS_DOCS_KEY_ID:         kmsDocsKey.keyId,
      },
      secrets: {
        DB_APP_PASSWORD: EcsSecret.fromSecretsManager(
          Secret.fromSecretNameV2(this, 'AppDbSecret', `stynx/${config.env}/db/app`),
          'password',
        ),
      },
      portMappings: [{ containerPort: 3000 }],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/healthz || exit 1'],
        interval: Duration.seconds(30),
        timeout:  Duration.seconds(5),
        retries:  3, startPeriod: Duration.seconds(60),
      },
    });

    // Fluent Bit sidecar for log shipping (optional; awslogs driver also works)
    // elided for space.

    // IAM — task role gets:
    //   - kms:Decrypt/Encrypt on docs key (scoped)
    //   - s3:* scoped to docsBucket prefix
    //   - secretsmanager:GetSecretValue on specific secrets
    //   - cognito-idp:AdminCreate/Get/InitiateAuth on the user pool
    docsBucket.grantReadWrite(taskDef.taskRole);
    kmsDocsKey.grantEncryptDecrypt(taskDef.taskRole);

    // -- Service --------------------------------------------------------
    this.service = new FargateService(this, 'AppService', {
      cluster, taskDefinition: taskDef,
      desiredCount: config.ecs.desiredCount,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(120),
      enableExecuteCommand: config.env !== 'prod',    // SSM exec for debug; off in prod
    });

    const scaling = this.service.autoScaleTaskCount({
      minCapacity: config.ecs.minCapacity, maxCapacity: config.ecs.maxCapacity,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', { targetUtilizationPercent: 60 });
    scaling.scaleOnMemoryUtilization('MemScaling', { targetUtilizationPercent: 70 });

    // -- ALB ------------------------------------------------------------
    this.alb = new ApplicationLoadBalancer(this, 'Alb', {
      vpc, internetFacing: true, http2Enabled: true,
    });

    const cert = Certificate.fromCertificateArn(this, 'AlbCert', config.certArn);

    const httpsListener = this.alb.addListener('Https', {
      port: 443, certificates: [cert], protocol: ApplicationProtocol.HTTPS,
      sslPolicy: /* TLS 1.2+ */ 'ELBSecurityPolicy-TLS13-1-2-2021-06' as any,
    });

    httpsListener.addTargets('AppTargets', {
      port: 3000, protocol: ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: { path: '/readyz', healthyHttpCodes: '200' },
      deregistrationDelay: Duration.seconds(30),
    });

    // /metrics is restricted to private subnets (SPEC §11.1)
    httpsListener.addAction('MetricsRestricted', {
      priority: 10,
      conditions: [ListenerCondition.pathPatterns(['/metrics'])],
      action: ListenerAction.fixedResponse(403, { contentType: 'text/plain', messageBody: 'restricted' }),
    });
    // A separate internal ALB listener (private) serves /metrics to AMP scrapers.
    // elided for space.

    this.alb.addListener('HttpRedirect', {
      port: 80, protocol: ApplicationProtocol.HTTP,
      defaultAction: ListenerAction.redirect({ protocol: 'HTTPS', port: '443', permanent: true }),
    });

    // -- WAF ------------------------------------------------------------
    const webAcl = new CfnWebACL(this, 'WebAcl', {
      name: `stynx-${config.env}-waf`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true,
                          metricName: `stynx-${config.env}-waf` },
      rules: [
        {
          name: 'AWS-CoreRuleSet', priority: 0, overrideAction: { none: {} },
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' } },
          visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: 'core' },
        },
        {
          name: 'AWS-KnownBadInputs', priority: 1, overrideAction: { none: {} },
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesKnownBadInputsRuleSet' } },
          visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: 'bad-inputs' },
        },
        {
          name: 'RateLimit-2000-per-5min', priority: 2, action: { block: {} },
          statement: { rateBasedStatement: { limit: 2000, aggregateKeyType: 'IP' } },
          visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: 'rate' },
        },
      ],
    });

    new CfnWebACLAssociation(this, 'WebAclAssoc', {
      resourceArn: this.alb.loadBalancerArn, webAclArn: webAcl.attrArn,
    });
  }
}
```

**Notes:**

- ECS Fargate (not EC2): simpler operational story; patching is AWS's problem.
- Two ALB listeners — public on 443, private internal for `/metrics` scrapes. Public listener short‑circuits `/metrics` with 403.
- Auto‑scaling on CPU + memory. For STYNX workloads request latency is also a good trigger (via custom CloudWatch metric); add in ObservabilityStack.
- WAF runs the Core and Known‑Bad‑Inputs managed rule groups plus a rate‑based rule matching STYNX‑SPEC §15.3 (2000 rpm/IP).

---

## 8. EdgeStack

CloudFront distribution in front of the regional ALB, with WAFv2 global scope,
an ACM certificate issued in `us-east-1`, and Route 53 alias records for the
configured API domain.

```typescript
// infra/lib/edge-stack.ts
export class EdgeStack extends Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);
    const { config, alb } = props;

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.hostedZoneName,
    });

    const certificate = new acm.Certificate(this, 'EdgeCertificate', {
      domainName: config.domain,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `stynx-${config.env}-edge-waf`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      rules: [
        {
          name: 'AWS-CoreRuleSet',
          priority: 0,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'edge-core',
          },
        },
        // KnownBadInputs and AmazonIpReputation managed rule groups follow
        // the same shape, then a 2000 requests / 5 minutes IP rate limit.
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `stynx-${config.env}-edge-waf`,
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'CloudFrontDistribution', {
      domainNames: [config.domain],
      certificate,
      webAclId: webAcl.attrArn,
      defaultBehavior: {
        origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      priceClass:
        config.env === 'prod'
          ? cloudfront.PriceClass.PRICE_CLASS_ALL
          : cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new route53.ARecord(this, 'ApiAliasA', {
      zone: hostedZone,
      recordName: config.domain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    new route53.AaaaRecord(this, 'ApiAliasAAAA', {
      zone: hostedZone,
      recordName: config.domain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });
  }
}
```

**Notes:**

- Edge resources synthesize in `us-east-1` because CloudFront requires ACM
  certificates and WAFv2 global web ACLs there. The workload stacks remain in
  the configured regional environment, usually `sa-east-1`.
- Environment config must name an existing Route 53 hosted zone through
  `hostedZoneId` and `hostedZoneName`. The `domain` must already be delegated to
  that hosted zone; if DNS lives in a platform account, share or pre-create the
  zone before deployment.
- `certArn` remains the regional ALB listener certificate consumed by
  ComputeStack. EdgeStack issues its own DNS-validated CloudFront certificate.
- EdgeStack exports the CloudFront distribution id/domain, WAF ARN, certificate
  ARN, and hosted zone id for operations and downstream automation.

---

## 9. ObservabilityStack

Amazon Managed Prometheus + Amazon Managed Grafana (STYNX‑SPEC §11.5). Alarms as per §11.4.

```typescript
// infra/lib/observability-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { CfnWorkspace } from 'aws-cdk-lib/aws-aps';                   // AMP
import { CfnWorkspace as AmgWorkspace } from 'aws-cdk-lib/aws-grafana'; // AMG
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: /*...*/) {
    super(scope, id, props);
    const { config, alb, ecsService, db, redis } = props;

    // -- AMP workspace --------------------------------------------------
    const amp = new CfnWorkspace(this, 'Amp', {
      alias: `stynx-${config.env}`,
    });

    // -- AMG workspace --------------------------------------------------
    const amg = new AmgWorkspace(this, 'Amg', {
      accountAccessType: 'CURRENT_ACCOUNT',
      authenticationProviders: ['AWS_SSO'],
      permissionType: 'SERVICE_MANAGED',
      name: `stynx-${config.env}`,
      dataSources: ['PROMETHEUS', 'CLOUDWATCH'],
    });

    // -- Alarm topic ----------------------------------------------------
    const topic = new Topic(this, 'AlarmTopic', { topicName: `stynx-${config.env}-alarms` });
    for (const email of config.alarmRecipients) {
      topic.addSubscription(new EmailSubscription(email));
    }

    // -- Baseline alarms (SPEC §11.4) -----------------------------------
    new Alarm(this, 'Alb5xxAlarm', {
      metric: alb.metrics.httpCodeTarget(/* HttpCodeTarget.TARGET_5XX_COUNT */ '5XX' as any, { period: Duration.minutes(5) }),
      threshold: 10, evaluationPeriods: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'ALB 5xx errors exceeding threshold',
    }).addAlarmAction(new SnsAction(topic));

    new Alarm(this, 'EcsCpuAlarm', {
      metric: ecsService.metricCpuUtilization(),
      threshold: 85, evaluationPeriods: 6,                 // sustained 30 min
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
    }).addAlarmAction(new SnsAction(topic));

    new Alarm(this, 'DbCpuAlarm', {
      metric: db.metricCPUUtilization(),
      threshold: 80, evaluationPeriods: 4,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
    }).addAlarmAction(new SnsAction(topic));

    new Alarm(this, 'DbFreeStorageAlarm', {
      metric: db.metricFreeStorageSpace(),
      threshold: 10 * 1024 * 1024 * 1024,                  // 10 GB
      evaluationPeriods: 1, comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
    }).addAlarmAction(new SnsAction(topic));

    new Alarm(this, 'DbConnectionsAlarm', {
      metric: db.metricDatabaseConnections(),
      threshold: config.env === 'prod' ? 200 : 80,
      evaluationPeriods: 3, comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
    }).addAlarmAction(new SnsAction(topic));

    // (Redis CPU/memory/evictions and audit-lag alarms elided for space.)

    // -- Grafana data sources, dashboards, folders
    //    are provisioned via the AMG API from a git-versioned folder in
    //    infra/dashboards/ using the @stynx-nyx/cdk AmgProvisioner construct.
    //    elided.
  }
}
```

**Notes:**

- AMP scrapes `/metrics` from the app via a private ALB listener (not shown). Alternative: the OTel Collector sidecar sends OTLP directly to AMP's remote‑write endpoint; either works.
- AMG with AWS SSO auth. Dashboards provisioned from files under `infra/dashboards/` — one JSON per dashboard, versioned alongside code.
- Alarms list is the baseline; each consumer app adds its own application‑level alarms (e.g., SLO burn rates).

---

## 10. IAM principles applied

Task role (ECS): read DB/Cognito/S3 secrets, read/write docs bucket (scoped to the env's bucket), encrypt/decrypt with the docs KMS key, admin‑API on the Cognito user pool, CloudWatch Logs write.

Execution role (ECS): pull from ECR, write to CloudWatch Logs, read from Secrets Manager for env injection.

Deploy role (CI → CDK): assume via GitHub OIDC federation, scoped to deploying this stack family. No long‑lived AWS keys in CI.

DB admin bootstrap: one‑shot job that assumes `stynx_owner` and creates `stynx_app` / `stynx_reader` roles. Runs during initial stack deployment and on major PG upgrades.

---

## 11. What's deliberately omitted

- **Hosted zone ownership and delegation.** EdgeStack creates the CloudFront
  distribution and A/AAAA aliases, but the hosted zone itself is an environment
  prerequisite. Cross-account DNS ownership belongs in account vending or
  platform bootstrap, not in this application skeleton.
- **GuardDuty / Security Hub / Config**. Security baseline lives in the AWS account landing zone, not in STYNX's stacks.
- **Backup / DR orchestration beyond RDS snapshot retention**. AWS Backup across accounts is recommended for prod, out‑of‑scope for this skeleton.
- **Cost allocation tags beyond the basics** — consumers can add `stynx:cost-center`, `stynx:product` as needed via the `Tags.of()` call in `bin/stynx-env.ts`.

---

## 12. Using this skeleton

1. Copy `infra/` into a new consumer repo (or use `stynx init`'s CDK scaffolding, which emits this structure pre‑filled with the consumer's name).
2. Customize `infra/config/&#123;env&#125;.ts` with the consumer's account IDs, domains, instance classes, capacity.
3. `cdk deploy -c env=dev` — deploys all seven stacks to dev.
4. Run the STYNX bootstrap migration (`stynx migrate up`) against the new DB.
5. Point `stynx init`'s generated app Docker image at this environment; deploy via CI.

Expected deploy time for a fresh environment: ~30 minutes (RDS is the long pole).

---

_End of CDK infrastructure reference._
