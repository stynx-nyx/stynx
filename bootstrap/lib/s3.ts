import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetBucketLocationCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketTaggingCommand,
  PutBucketWebsiteCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { baseAwsConfig, defaultTags, ensureDryRun, logAws } from './aws';

export interface S3EnsureInput {
  bucketName: string;
  appName: string;
  region: string;
  profile?: string;
  dryRun?: boolean;
  debug?: boolean;
  website?: boolean;
}

function client(ctx: S3EnsureInput) {
  return new S3Client(baseAwsConfig({
    region: ctx.region,
    profile: ctx.profile,
    debug: ctx.debug,
    dryRun: ctx.dryRun,
    appName: ctx.appName,
  }));
}

async function bucketExists(s3: S3Client, bucket: string): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (err: any) {
    if (String(err?.$metadata?.httpStatusCode) === '404' || String(err?.name) === 'NotFound') {
      return false;
    }
    throw err;
  }
}

export async function ensureBucket(ctx: S3EnsureInput): Promise<void> {
  const s3 = client(ctx);
  const exists = await bucketExists(s3, ctx.bucketName);
  if (!exists) {
    if (ensureDryRun({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `create bucket ${ctx.bucketName}`)) {
      return;
    }
    const createInput: any = { Bucket: ctx.bucketName };
    if (ctx.region !== 'us-east-1') {
      createInput.CreateBucketConfiguration = { LocationConstraint: ctx.region };
    }
    await s3.send(new CreateBucketCommand(createInput));
  }
  await s3.send(
    new PutBucketTaggingCommand({
      Bucket: ctx.bucketName,
      Tagging: {
        TagSet: Object.entries(defaultTags(ctx.appName)).map(([Key, Value]) => ({ Key, Value })),
      },
    }),
  );
  if (ctx.website) {
    await s3.send(
      new PutBucketWebsiteCommand({
        Bucket: ctx.bucketName,
        WebsiteConfiguration: {
          IndexDocument: { Suffix: 'index.html' },
          ErrorDocument: { Key: 'index.html' },
        },
      }),
    );
  } else {
    await s3.send(
      new PutPublicAccessBlockCommand({
        Bucket: ctx.bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      }),
    );
  }
  logAws({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `bucket ready ${ctx.bucketName}`);
}

export async function deleteBucket(ctx: S3EnsureInput): Promise<void> {
  const s3 = client(ctx);
  const exists = await bucketExists(s3, ctx.bucketName);
  if (!exists) {
    logAws({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `bucket ${ctx.bucketName} already removed`);
    return;
  }
  if (ensureDryRun({ region: ctx.region, profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `delete bucket ${ctx.bucketName}`)) {
    return;
  }
  let token: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: ctx.bucketName, ContinuationToken: token }));
    const keys = res.Contents?.map((item) => ({ Key: item.Key! })) ?? [];
    if (keys.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: ctx.bucketName, Delete: { Objects: keys } }));
    }
    token = res.NextContinuationToken ?? undefined;
  } while (token);
  await s3.send(new DeleteBucketCommand({ Bucket: ctx.bucketName }));
}

export async function resolveBucketRegion(ctx: S3EnsureInput): Promise<string | undefined> {
  const s3 = client(ctx);
  try {
    const res = await s3.send(new GetBucketLocationCommand({ Bucket: ctx.bucketName }));
    return res.LocationConstraint || 'us-east-1';
  } catch (err: any) {
    if (String(err?.$metadata?.httpStatusCode) === '404') {
      return undefined;
    }
    throw err;
  }
}
