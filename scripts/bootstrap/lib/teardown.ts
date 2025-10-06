import { deleteUserPool, deleteAppClient, deleteGroups } from './cognito';
import { deleteBucket } from './s3';
import { deleteDistribution } from './cloudfront';
import { dropDatabase, DatabaseConfig } from './db';
import { writeEnv, BACKEND_ENV_PATH } from './env';

export interface TeardownOptions {
  appName: string;
  region: string;
  profile?: string;
  dryRun?: boolean;
  debug?: boolean;
  userPoolId?: string;
  appClientId?: string;
  storageBucket?: string;
  frontendBucket?: string;
  cloudfrontId?: string;
  db?: DatabaseConfig;
  deleteDb?: boolean;
}

export async function teardown(ctx: TeardownOptions): Promise<void> {
  if (ctx.cloudfrontId) {
    await deleteDistribution({
      appName: ctx.appName,
      region: ctx.region,
      profile: ctx.profile,
      dryRun: ctx.dryRun,
      debug: ctx.debug,
      bucketDomain: '',
    }, ctx.cloudfrontId);
  }

  if (ctx.frontendBucket) {
    await deleteBucket({
      appName: ctx.appName,
      region: ctx.region,
      profile: ctx.profile,
      dryRun: ctx.dryRun,
      debug: ctx.debug,
      bucketName: ctx.frontendBucket,
      website: true,
    });
  }

  if (ctx.storageBucket) {
    await deleteBucket({
      appName: ctx.appName,
      region: ctx.region,
      profile: ctx.profile,
      dryRun: ctx.dryRun,
      debug: ctx.debug,
      bucketName: ctx.storageBucket,
    });
  }

  if (ctx.userPoolId) {
    if (ctx.appClientId) {
      await deleteAppClient({
        appName: ctx.appName,
        region: ctx.region,
        profile: ctx.profile,
        dryRun: ctx.dryRun,
        debug: ctx.debug,
        frontendUrl: '',
        logoutUrl: '',
      }, ctx.userPoolId, ctx.appClientId);
    }
    await deleteGroups({
      appName: ctx.appName,
      region: ctx.region,
      profile: ctx.profile,
      dryRun: ctx.dryRun,
      debug: ctx.debug,
      frontendUrl: '',
      logoutUrl: '',
    }, ctx.userPoolId);
    await deleteUserPool({
      appName: ctx.appName,
      region: ctx.region,
      profile: ctx.profile,
      dryRun: ctx.dryRun,
      debug: ctx.debug,
      frontendUrl: '',
      logoutUrl: '',
    }, ctx.userPoolId);
  }

  if (ctx.deleteDb && ctx.db) {
    await dropDatabase(ctx.db, { dryRun: ctx.dryRun, debug: ctx.debug });
  }

  await writeEnv(BACKEND_ENV_PATH, {
    COGNITO_USERPOOL_ID: undefined,
    COGNITO_CLIENT_ID: undefined,
    S3_BUCKET_STORAGE: undefined,
    S3_BUCKET_FRONTEND: undefined,
    CLOUDFRONT_DIST_ID: undefined,
    CLOUDFRONT_DOMAIN: undefined,
    EC2_INSTANCE_ID: undefined,
  }, { dryRun: ctx.dryRun, debug: ctx.debug });
}
