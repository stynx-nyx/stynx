import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { dev } from '../lib/config/dev';
import { DataStack } from '../lib/data-stack';
import { NetworkStack } from '../lib/network-stack';

describe('DataStack', () => {
  it('creates postgres, redis, and pgbouncer resources', () => {
    const app = new App();
    const network = new NetworkStack(app, 'network-test', {
      config: dev,
    });
    const stack = new DataStack(app, 'data-test', {
      config: dev,
      vpc: network.vpc,
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::RDS::DBInstance', 1);
    template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    template.resourceCountIs('AWS::ElastiCache::ReplicationGroup', 1);
    template.resourceCountIs('AWS::ECS::Service', 1);
  });
});
