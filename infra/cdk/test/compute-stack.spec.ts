import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ComputeStack } from '../lib/compute-stack';
import { dev } from '../lib/config/dev';
import { DataStack } from '../lib/data-stack';
import { IdentityStack } from '../lib/identity-stack';
import { NetworkStack } from '../lib/network-stack';
import { StorageStack } from '../lib/storage-stack';

describe('ComputeStack', () => {
  it('creates ECS, ALB, listeners, and WAF wiring', () => {
    const app = new App();
    const network = new NetworkStack(app, 'network-test', { config: dev });
    const identity = new IdentityStack(app, 'identity-test', { config: dev });
    const data = new DataStack(app, 'data-test', { config: dev, vpc: network.vpc });
    const storage = new StorageStack(app, 'storage-test', { config: dev });
    const stack = new ComputeStack(app, 'compute-test', {
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
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::ECS::Service', 1);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 2);
    template.resourceCountIs('AWS::WAFv2::WebACL', 1);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'app',
          PortMappings: Match.arrayWith([
            Match.objectLike({
              ContainerPort: 3000,
            }),
          ]),
        }),
      ]),
    });
  });
});
