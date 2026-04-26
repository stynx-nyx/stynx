import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as aps from 'aws-cdk-lib/aws-aps';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elastiCache from 'aws-cdk-lib/aws-elasticache';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as grafana from 'aws-cdk-lib/aws-grafana';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import type { EnvConfig } from './config';

export interface ObservabilityStackProps extends StackProps {
  config: EnvConfig;
  alb: elbv2.ApplicationLoadBalancer;
  ecsService: ecs.FargateService;
  db: rds.DatabaseInstance;
  redis: elastiCache.CfnReplicationGroup;
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const { config, alb, ecsService, db, redis } = props;

    new aps.CfnWorkspace(this, 'Amp', {
      alias: `stynx-${config.env}`,
    });

    new grafana.CfnWorkspace(this, 'Amg', {
      accountAccessType: 'CURRENT_ACCOUNT',
      authenticationProviders: ['AWS_SSO'],
      permissionType: 'SERVICE_MANAGED',
      name: `stynx-${config.env}`,
      dataSources: ['PROMETHEUS', 'CLOUDWATCH'],
    });

    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `stynx-${config.env}-alarms`,
    });

    for (const email of config.alarmRecipients) {
      alarmTopic.addSubscription(new subscriptions.EmailSubscription(email));
    }

    const alarmAction = new cloudwatchActions.SnsAction(alarmTopic);

    new cloudwatch.Alarm(this, 'Alb5xxAlarm', {
      metric: alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
        period: Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'ALB 5xx errors exceeding threshold',
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, 'EcsCpuAlarm', {
      metric: ecsService.metricCpuUtilization(),
      threshold: 85,
      evaluationPeriods: 6,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, 'DbCpuAlarm', {
      metric: db.metricCPUUtilization(),
      threshold: 80,
      evaluationPeriods: 4,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, 'DbFreeStorageAlarm', {
      metric: db.metricFreeStorageSpace(),
      threshold: 10 * 1024 * 1024 * 1024,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, 'DbConnectionsAlarm', {
      metric: db.metricDatabaseConnections(),
      threshold: config.env === 'prod' ? 200 : 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    }).addAlarmAction(alarmAction);

    const redisGroupId = redis.ref;

    new cloudwatch.Alarm(this, 'RedisCpuAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          ReplicationGroupId: redisGroupId,
        },
        period: Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, 'RedisEvictionsAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'Evictions',
        dimensionsMap: {
          ReplicationGroupId: redisGroupId,
        },
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(alarmAction);
  }
}
