import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type { Construct } from 'constructs';
import type { EnvConfig } from './config';

export interface EdgeStackProps extends StackProps {
  config: EnvConfig;
  alb: elbv2.ApplicationLoadBalancer;
}

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
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `stynx-${config.env}-edge-waf`,
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
            metricName: 'edge-core',
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
            metricName: 'edge-bad-inputs',
          },
        },
        {
          name: 'AWS-IPReputation',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'edge-ip-reputation',
          },
        },
        {
          name: 'RateLimit-2000-per-5min',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              aggregateKeyType: 'IP',
              limit: 2000,
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'edge-rate',
          },
        },
      ],
    });

    this.distribution = new cloudfront.Distribution(this, 'CloudFrontDistribution', {
      domainNames: [config.domain],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      webAclId: webAcl.attrArn,
      defaultBehavior: {
        origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      comment: `STYNX ${config.env} edge distribution`,
      enableIpv6: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: config.env === 'prod'
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

    new CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      exportName: `stynx-${config.env}-edge-distribution-id`,
    });
    new CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      exportName: `stynx-${config.env}-edge-domain-name`,
    });
    new CfnOutput(this, 'EdgeWebAclArn', {
      value: webAcl.attrArn,
      exportName: `stynx-${config.env}-edge-web-acl-arn`,
    });
    new CfnOutput(this, 'EdgeCertificateArn', {
      value: certificate.certificateArn,
      exportName: `stynx-${config.env}-edge-certificate-arn`,
    });
    new CfnOutput(this, 'EdgeHostedZoneId', {
      value: config.hostedZoneId,
      exportName: `stynx-${config.env}-edge-hosted-zone-id`,
    });
  }
}
