import { RemovalPolicy, Stack, type StackProps, aws_logs as logs } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import type { EnvConfig } from './config';

export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: StackProps & { config: EnvConfig }) {
    super(scope, id, props);

    const { config } = props;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(config.vpc.cidr),
      maxAzs: config.vpc.maxAzs,
      natGateways: config.env === 'prod' ? config.vpc.maxAzs : 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    for (const service of [
      ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      ec2.InterfaceVpcEndpointAwsService.KMS,
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ec2.InterfaceVpcEndpointAwsService.ECR,
      ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
    ]) {
      this.vpc.addInterfaceEndpoint(`Endpoint${service.shortName.replace(/[^A-Za-z0-9]/g, '')}`, {
        service,
        privateDnsEnabled: true,
      });
    }

    const flowLogGroup = new logs.LogGroup(this, 'FlowLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.vpc.addFlowLog('VpcFlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });
  }
}
