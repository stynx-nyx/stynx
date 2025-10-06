import {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateInvalidationCommand,
  DeleteDistributionCommand,
  GetDistributionCommand,
  ListDistributionsCommand,
  TagResourceCommand,
  UpdateDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import { baseAwsConfig, defaultTags, ensureDryRun, logAws } from './aws';

export interface CloudFrontEnsureInput {
  appName: string;
  bucketDomain: string;
  aliases?: string[];
  profile?: string;
  region: string;
  dryRun?: boolean;
  debug?: boolean;
}

function client(ctx: CloudFrontEnsureInput) {
  return new CloudFrontClient(baseAwsConfig({
    // CloudFront is global; region must be us-east-1
    region: 'us-east-1',
    profile: ctx.profile,
    debug: ctx.debug,
    dryRun: ctx.dryRun,
    appName: ctx.appName,
  }));
}

async function findDistribution(cf: CloudFrontClient, bucketDomain: string, alias?: string): Promise<{ id: string; domain: string } | undefined> {
  const res = await cf.send(new ListDistributionsCommand({}));
  const matches = res.DistributionList?.Items?.find((item) => {
    const origin = item.Origins?.Items?.find((o) => o.DomainName === bucketDomain);
    const aliasMatch = alias ? item.Aliases?.Items?.includes(alias) : true;
    return Boolean(origin) && aliasMatch;
  });
  if (!matches || !matches.Id || !matches.DomainName) {
    return undefined;
  }
  return { id: matches.Id, domain: matches.DomainName };
}

export interface CloudFrontEnsureOutput {
  distributionId: string;
  domainName: string;
}

export async function ensureDistribution(ctx: CloudFrontEnsureInput): Promise<CloudFrontEnsureOutput> {
  const cf = client(ctx);
  const alias = ctx.aliases?.[0];
  const existing = await findDistribution(cf, ctx.bucketDomain, alias);
  if (existing) {
    logAws({ region: 'us-east-1', profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `using existing CloudFront distribution ${existing.id}`);
    return { distributionId: existing.id, domainName: existing.domain };
  }
  if (ensureDryRun({ region: 'us-east-1', profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `create CloudFront distribution for ${ctx.bucketDomain}`)) {
    return { distributionId: 'DRY_RUN_CF', domainName: 'd111111abcdef8.cloudfront.net' };
  }
  const callerReference = `${ctx.appName}-${Date.now()}`;
  const distribution = await cf.send(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: callerReference,
        Comment: `${ctx.appName} distribution`,
        Enabled: true,
        DefaultRootObject: 'index.html',
        Aliases: ctx.aliases && ctx.aliases.length ? { Quantity: ctx.aliases.length, Items: ctx.aliases } : { Quantity: 0 },
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: `${ctx.appName}-origin`,
              DomainName: ctx.bucketDomain,
              S3OriginConfig: {
                OriginAccessIdentity: '',
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: `${ctx.appName}-origin`,
          ViewerProtocolPolicy: 'redirect-to-https',
          ForwardedValues: {
            QueryString: false,
            Cookies: { Forward: 'none' },
          },
          AllowedMethods: {
            Quantity: 2,
            Items: ['GET', 'HEAD'],
          },
          CachedMethods: {
            Quantity: 2,
            Items: ['GET', 'HEAD'],
          },
          MinTTL: 0,
        },
      },
    }),
  );
  const distributionId = distribution.Distribution?.Id;
  const domainName = distribution.Distribution?.DomainName;
  if (!distributionId || !domainName) {
    throw new Error('Failed to create CloudFront distribution');
  }
  if (distribution.Distribution?.ARN) {
    await cf.send(
      new TagResourceCommand({
        Resource: distribution.Distribution.ARN,
        Tags: { Items: Object.entries(defaultTags(ctx.appName)).map(([Key, Value]) => ({ Key, Value })) },
      }),
    );
  }
  return { distributionId, domainName };
}

async function disableDistribution(cf: CloudFrontClient, id: string): Promise<string> {
  const current = await cf.send(new GetDistributionCommand({ Id: id }));
  const config = current.Distribution?.DistributionConfig;
  if (!config) {
    throw new Error(`Unable to load distribution config for ${id}`);
  }
  if (!config.Enabled) {
    return current.ETag ?? '';
  }
  const updated = await cf.send(
    new UpdateDistributionCommand({
      Id: id,
      IfMatch: current.ETag,
      DistributionConfig: { ...config, Enabled: false },
    }),
  );
  let attempts = 0;
  while (attempts < 20) {
    const check = await cf.send(new GetDistributionCommand({ Id: id }));
    if (check.Distribution?.Status === 'Deployed' && check.Distribution?.DistributionConfig?.Enabled === false) {
      return check.ETag ?? '';
    }
    await new Promise((resolve) => setTimeout(resolve, 15000));
    attempts += 1;
  }
  return updated.ETag ?? '';
}

export async function deleteDistribution(ctx: CloudFrontEnsureInput, distributionId: string): Promise<void> {
  const cf = client(ctx);
  if (ensureDryRun({ region: 'us-east-1', profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `delete CloudFront distribution ${distributionId}`)) {
    return;
  }
  const etag = await disableDistribution(cf, distributionId);
  await cf.send(new DeleteDistributionCommand({ Id: distributionId, IfMatch: etag }));
}

export async function invalidateDistribution(ctx: CloudFrontEnsureInput, distributionId: string, path = '/*'): Promise<void> {
  const cf = client(ctx);
  if (ensureDryRun({ region: 'us-east-1', profile: ctx.profile, dryRun: ctx.dryRun, debug: ctx.debug, appName: ctx.appName }, `create invalidation on ${distributionId}`)) {
    return;
  }
  await cf.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: [path],
        },
      },
    }),
  );
}
