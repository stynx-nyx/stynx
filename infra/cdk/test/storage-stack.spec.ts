import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { dev } from '../lib/config/dev';
import { StorageStack } from '../lib/storage-stack';

describe('StorageStack', () => {
  it('creates a KMS-encrypted versioned docs bucket with lifecycle rules', () => {
    const app = new App();
    const stack = new StorageStack(app, 'storage-test', {
      config: dev,
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::KMS::Key', 1);
    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: {
        Status: 'Enabled',
      },
      BucketEncryption: Match.anyValue(),
      LifecycleConfiguration: Match.objectLike({
        Rules: Match.arrayWith([
          Match.objectLike({ Id: 'transition-ia', Status: 'Enabled' }),
          Match.objectLike({ Id: 'transition-glacier-ir', Status: 'Enabled' }),
          Match.objectLike({ Id: 'transition-deep-archive', Status: 'Enabled' }),
        ]),
      }),
    });
  });
});
