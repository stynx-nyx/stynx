import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { dev } from '../lib/config/dev';
import { IdentityStack } from '../lib/identity-stack';

describe('IdentityStack', () => {
  it('creates one user pool and two app clients', () => {
    const app = new App();
    const stack = new IdentityStack(app, 'identity-test', {
      config: dev,
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 2);
  });
});
