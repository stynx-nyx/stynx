import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ComputeStack } from '../lib/compute-stack';
import type { EnvConfig } from '../lib/config';
import { DataStack } from '../lib/data-stack';
import { dev } from '../lib/config/dev';
import { EdgeStack } from '../lib/edge-stack';
import { IdentityStack } from '../lib/identity-stack';
import { NetworkStack } from '../lib/network-stack';
import { prod } from '../lib/config/prod';
import { stage } from '../lib/config/stage';
import { StorageStack } from '../lib/storage-stack';

describe('EdgeStack', () => {
  function createEdgeTemplate(config: EnvConfig): Template {
    const app = new App();
    const regionalEnv = { account: config.accountId, region: config.region };
    const edgeEnv = { account: config.accountId, region: 'us-east-1' };
    const network = new NetworkStack(app, `${config.env}-network-test`, { config, env: regionalEnv });
    const identity = new IdentityStack(app, `${config.env}-identity-test`, { config, env: regionalEnv });
    const data = new DataStack(app, `${config.env}-data-test`, { config, vpc: network.vpc, env: regionalEnv });
    const storage = new StorageStack(app, `${config.env}-storage-test`, { config, env: regionalEnv });
    const compute = new ComputeStack(app, `${config.env}-compute-test`, {
      config,
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
      imageTag: `${config.env}-test-tag`,
    });
    const stack = new EdgeStack(app, `${config.env}-edge-test`, {
      config,
      alb: compute.alb,
      env: edgeEnv,
      crossRegionReferences: true,
    });
    return Template.fromStack(stack);
  }

  it.each([dev, stage, prod])('creates CloudFront, global WAF, ACM, DNS aliases, and outputs for %s', (config) => {
    const template = createEdgeTemplate(config);

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
        Aliases: [config.domain],
        PriceClass: config.env === 'prod' ? 'PriceClass_All' : 'PriceClass_100',
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
    for (const outputName of [
      'CloudFrontDistributionId',
      'CloudFrontDomainName',
      'EdgeWebAclArn',
      'EdgeCertificateArn',
      'EdgeHostedZoneId',
    ]) {
      template.hasOutput(outputName, {
        Value: Match.anyValue(),
        Export: {
          Name: Match.stringLikeRegexp(`^stynx-${config.env}-edge-`),
        },
      });
    }
  });
});
