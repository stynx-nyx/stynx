import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ComputeStack } from '../lib/compute-stack';
import { dev } from '../lib/config/dev';
import { DataStack } from '../lib/data-stack';
import { EdgeStack } from '../lib/edge-stack';
import { IdentityStack } from '../lib/identity-stack';
import { NetworkStack } from '../lib/network-stack';
import { StorageStack } from '../lib/storage-stack';

describe('EdgeStack', () => {
  it('creates CloudFront, global WAF, ACM, and DNS alias records', () => {
    const app = new App();
    const regionalEnv = { account: dev.accountId, region: dev.region };
    const edgeEnv = { account: dev.accountId, region: 'us-east-1' };
    const network = new NetworkStack(app, 'network-test', { config: dev, env: regionalEnv });
    const identity = new IdentityStack(app, 'identity-test', { config: dev, env: regionalEnv });
    const data = new DataStack(app, 'data-test', { config: dev, vpc: network.vpc, env: regionalEnv });
    const storage = new StorageStack(app, 'storage-test', { config: dev, env: regionalEnv });
    const compute = new ComputeStack(app, 'compute-test', {
      config: dev,
      env: regionalEnv,
      crossRegionReferences: true,
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
    const stack = new EdgeStack(app, 'edge-test', {
      config: dev,
      alb: compute.alb,
      env: edgeEnv,
      crossRegionReferences: true,
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    template.resourceCountIs('AWS::WAFv2::WebACL', 1);
    template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    template.resourceCountIs('AWS::Route53::RecordSet', 2);
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Scope: 'CLOUDFRONT',
      Rules: Match.arrayWith([
        Match.objectLike({
          Statement: {
            ManagedRuleGroupStatement: {
              VendorName: 'AWS',
              Name: 'AWSManagedRulesCommonRuleSet',
            },
          },
        }),
        Match.objectLike({
          Statement: {
            ManagedRuleGroupStatement: {
              VendorName: 'AWS',
              Name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
        }),
        Match.objectLike({
          Statement: {
            ManagedRuleGroupStatement: {
              VendorName: 'AWS',
              Name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
        }),
        Match.objectLike({
          Statement: {
            RateBasedStatement: {
              AggregateKeyType: 'IP',
              Limit: 2000,
            },
          },
        }),
      ]),
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: [dev.domain],
        Origins: Match.arrayWith([
          Match.objectLike({
            DomainName: Match.anyValue(),
            CustomOriginConfig: Match.objectLike({
              OriginProtocolPolicy: 'https-only',
            }),
          }),
        ]),
      }),
    });
  });
});
