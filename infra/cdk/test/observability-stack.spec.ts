import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ComputeStack } from '../lib/compute-stack';
import { dev } from '../lib/config/dev';
import { DataStack } from '../lib/data-stack';
import { IdentityStack } from '../lib/identity-stack';
import { NetworkStack } from '../lib/network-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { StorageStack } from '../lib/storage-stack';

describe('ObservabilityStack', () => {
  it('creates AMP, AMG, SNS alerts, and baseline alarms', () => {
    const app = new App();
    const network = new NetworkStack(app, 'network-test', { config: dev });
    const identity = new IdentityStack(app, 'identity-test', { config: dev });
    const data = new DataStack(app, 'data-test', { config: dev, vpc: network.vpc });
    const storage = new StorageStack(app, 'storage-test', { config: dev });
    const compute = new ComputeStack(app, 'compute-test', {
      config: dev,
      vpc: network.vpc,
      dbSecret: data.dbSecret,
      dbEndpoint: data.pgBouncerEndpoint,
      redisEndpoint: data.redisEndpoint,
      userPoolId: identity.userPool.userPoolId,
      userPoolClientId: identity.apiClient.userPoolClientId,
      docsBucket: storage.docsBucket,
      kmsDocsKey: storage.kmsDocsKey,
      imageTag: 'test-tag',
    });
    const stack = new ObservabilityStack(app, 'observability-test', {
      config: dev,
      alb: compute.alb,
      ecsService: compute.service,
      db: data.db,
      redis: data.redis,
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::APS::Workspace', 1);
    template.resourceCountIs('AWS::Grafana::Workspace', 1);
    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.resourceCountIs('AWS::CloudWatch::Alarm', 7);
  });
});
