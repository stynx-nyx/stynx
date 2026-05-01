import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as kms from 'aws-cdk-lib/aws-kms';
import type { Construct } from 'constructs';
import type { EnvConfig } from './config';

export interface ComputeStackProps extends StackProps {
  config: EnvConfig;
  vpc: ec2.Vpc;
  dbSecret: secretsmanager.Secret;
  dbEndpoint: string;
  redisEndpoint: string;
  userPoolId: string;
  userPoolClientId: string;
  docsBucket: s3.Bucket;
  kmsDocsKey: kms.Key;
  imageTag: string;
}

export class ComputeStack extends Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const {
      config,
      vpc,
      dbSecret,
      dbEndpoint,
      redisEndpoint,
      userPoolId,
      userPoolClientId,
      docsBucket,
      kmsDocsKey,
      imageTag,
    } = props;

    const appLogGroup = new logs.LogGroup(this, 'AppLogs', {
      logGroupName: `/aws/ecs/stynx-${config.env}`,
      retention: config.env === 'prod' ? logs.RetentionDays.SIX_MONTHS : logs.RetentionDays.ONE_MONTH,
    });

    const cluster = new ecs.Cluster(this, 'AppCluster', {
      vpc,
      clusterName: `stynx-${config.env}`,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const repository = ecr.Repository.fromRepositoryName(
      this,
      'AppRepository',
      config.ecs.imageRepositoryName,
    );

    const appDbSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'AppDbSecret',
      `stynx/${config.env}/db/app`,
    );

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'AppTask', {
      cpu: config.ecs.cpu,
      memoryLimitMiB: config.ecs.memory,
    });

    taskDefinition.addContainer('app', {
      image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
      essential: true,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'app',
        logGroup: appLogGroup,
      }),
      environment: {
        GLOG_minloglevel: '2',
        NODE_ENV: config.env,
        AWS_REGION: config.region,
        STYNX_ENV: config.env,
        PGBOUNCER_HOST: dbEndpoint,
        REDIS_URL: `rediss://${redisEndpoint}:6379`,
        COGNITO_USER_POOL_ID: userPoolId,
        COGNITO_CLIENT_ID: userPoolClientId,
        DOCS_BUCKET: docsBucket.bucketName,
        KMS_DOCS_KEY_ID: kmsDocsKey.keyId,
      },
      secrets: {
        DB_APP_PASSWORD: ecs.Secret.fromSecretsManager(appDbSecret, 'password'),
        DB_OWNER_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },
      portMappings: [{ containerPort: 3000 }],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/healthz || exit 1'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
    });

    docsBucket.grantReadWrite(taskDefinition.taskRole);
    kmsDocsKey.grantEncryptDecrypt(taskDefinition.taskRole);
    dbSecret.grantRead(taskDefinition.taskRole);

    this.service = new ecs.FargateService(this, 'AppService', {
      cluster,
      taskDefinition,
      desiredCount: config.ecs.desiredCount,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(120),
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      enableExecuteCommand: config.env !== 'prod',
    });

    const scaling = this.service.autoScaleTaskCount({
      minCapacity: config.ecs.minCapacity,
      maxCapacity: config.ecs.maxCapacity,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', { targetUtilizationPercent: 60 });
    scaling.scaleOnMemoryUtilization('MemScaling', { targetUtilizationPercent: 70 });

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      http2Enabled: true,
    });

    const certificate = acm.Certificate.fromCertificateArn(this, 'AlbCert', config.certArn);
    const httpsListener = this.alb.addListener('Https', {
      port: 443,
      certificates: [certificate],
      protocol: elbv2.ApplicationProtocol.HTTPS,
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
    });

    httpsListener.addTargets('AppTargets', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [
        this.service.loadBalancerTarget({
          containerName: 'app',
          containerPort: 3000,
        }),
      ],
      healthCheck: {
        path: '/readyz',
        healthyHttpCodes: '200',
      },
      deregistrationDelay: Duration.seconds(30),
    });

    httpsListener.addAction('MetricsRestricted', {
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/metrics'])],
      action: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'restricted',
      }),
    });

    this.alb.addListener('HttpRedirect', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `stynx-${config.env}-waf`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `stynx-${config.env}-waf`,
      },
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
            metricName: 'core',
          },
        },
        {
          name: 'AWS-KnownBadInputs',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'bad-inputs',
          },
        },
        {
          name: 'RateLimit-2000-per-5min',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'rate',
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: this.alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });
  }
}
