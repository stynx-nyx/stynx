import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { EnvConfig } from './config';

export interface DataStackProps extends StackProps {
  config: EnvConfig;
  vpc: ec2.Vpc;
}

export class DataStack extends Stack {
  public readonly db: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.Secret;
  public readonly pgBouncerEndpoint: string;
  public readonly redis: elasticache.CfnReplicationGroup;
  public readonly redisEndpoint: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { config, vpc } = props;

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'RDS Postgres',
    });

    this.dbSecret = new secretsmanager.Secret(this, 'DbMasterSecret', {
      secretName: `stynx/${config.env}/db/master`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'stynx_owner' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 40,
      },
    });

    this.db = new rds.DatabaseInstance(this, 'Postgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSg],
      multiAz: config.db.multiAz,
      allocatedStorage: config.db.storageGb,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: Duration.days(config.db.backupRetentionDays),
      deleteAutomatedBackups: config.env !== 'prod',
      deletionProtection: config.env === 'prod',
      cloudwatchLogsExports: ['postgresql'],
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.SNAPSHOT,
    });

    const pgBouncerCluster = new ecs.Cluster(this, 'PgBouncerCluster', {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const pgBouncerSg = new ec2.SecurityGroup(this, 'PgBouncerSg', {
      vpc,
      description: 'PgBouncer',
      allowAllOutbound: false,
    });
    pgBouncerSg.connections.allowTo(dbSg, ec2.Port.tcp(5432));
    dbSg.connections.allowFrom(pgBouncerSg, ec2.Port.tcp(5432));

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'PgBouncerTask', {
      cpu: 256,
      memoryLimitMiB: 512,
    });
    taskDefinition.addContainer('pgbouncer', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/bitnami/pgbouncer:1.24.1'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'pgbouncer',
        logGroup: new logs.LogGroup(this, 'PgBouncerLogs', {
          retention: logs.RetentionDays.ONE_MONTH,
        }),
      }),
      environment: {
        GLOG_minloglevel: '2',
        POSTGRESQL_HOST: this.db.instanceEndpoint.hostname,
        POSTGRESQL_PORT_NUMBER: this.db.instanceEndpoint.port.toString(),
        POSTGRESQL_USERNAME: 'stynx_owner',
        PGBOUNCER_POOL_MODE: 'transaction',
      },
      secrets: {
        POSTGRESQL_PASSWORD: ecs.Secret.fromSecretsManager(this.dbSecret, 'password'),
      },
      portMappings: [
        { containerPort: 5432 },
      ],
    });

    new ecs.FargateService(this, 'PgBouncerService', {
      cluster: pgBouncerCluster,
      taskDefinition,
      desiredCount: config.env === 'prod' ? 2 : 1,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [pgBouncerSg],
      minHealthyPercent: 100,
    });

    this.pgBouncerEndpoint = `pgbouncer.${config.env}.stynx.internal:5432`;

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnets', {
      cacheSubnetGroupName: `stynx-${config.env}-redis`,
      subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      description: 'STYNX Redis subnet group',
    });

    const redisParams = new elasticache.CfnParameterGroup(this, 'RedisParams', {
      cacheParameterGroupFamily: 'redis7',
      description: 'STYNX Redis params',
      properties: {
        'notify-keyspace-events': 'Ex',
        'maxmemory-policy': 'volatile-lru',
      },
    });

    const redisSg = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc,
      description: 'Redis',
    });

    this.redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
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
