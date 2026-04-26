import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { EnvConfig } from './config';

export class StorageStack extends Stack {
  public readonly docsBucket: s3.Bucket;
  public readonly kmsDocsKey: kms.Key;

  constructor(scope: Construct, id: string, props: StackProps & { config: EnvConfig }) {
    super(scope, id, props);

    const { config } = props;

    this.kmsDocsKey = new kms.Key(this, 'DocsKey', {
      alias: `alias/stynx-docs-${config.env}`,
      description: 'STYNX document storage KMS CMK',
      enableKeyRotation: true,
      keySpec: kms.KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.docsBucket = new s3.Bucket(this, 'DocsBucket', {
      bucketName: `stynx-docs-${config.env}-${config.region.replace(/-/g, '')}`,
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.kmsDocsKey,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      eventBridgeEnabled: true,
      lifecycleRules: [
        {
          id: 'transition-ia',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
        },
        {
          id: 'transition-glacier-ir',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: Duration.days(180),
            },
          ],
        },
        {
          id: 'transition-deep-archive',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: Duration.days(730),
            },
          ],
        },
        {
          id: 'expire-noncurrent',
          enabled: true,
          noncurrentVersionExpiration: Duration.days(90),
        },
        {
          id: 'expire-incomplete-uploads',
          enabled: true,
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: config.env !== 'prod',
    });
  }
}
