import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { dev } from '../lib/config/dev';
import { NetworkStack } from '../lib/network-stack';

describe('NetworkStack', () => {
  it('creates a VPC with flow logs and endpoints', () => {
    const app = new App();
    const stack = new NetworkStack(app, 'network-test', {
      config: dev,
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.resourceCountIs('AWS::EC2::FlowLog', 1);
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 6);
  });
});
