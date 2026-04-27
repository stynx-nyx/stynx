#!/usr/bin/env node
import 'source-map-support/register';
import { App, Tags } from 'aws-cdk-lib';
import { ComputeStack } from '../lib/compute-stack';
import { DataStack } from '../lib/data-stack';
import { EdgeStack } from '../lib/edge-stack';
import { IdentityStack } from '../lib/identity-stack';
import { NetworkStack } from '../lib/network-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { StorageStack } from '../lib/storage-stack';
import { loadEnvConfig, type EnvName } from '../lib/config';

const app = new App();
const envName = app.node.tryGetContext('env') as EnvName | undefined;

if (!envName || !['dev', 'stage', 'prod'].includes(envName)) {
  throw new Error(`Invalid env: ${envName ?? '<missing>'}. Expected one of: dev, stage, prod`);
}

const config = loadEnvConfig(envName);
const awsEnv = {
  account: config.accountId,
  region: config.region,
};
const imageTag = String(app.node.tryGetContext('imageTag') ?? 'latest');

const network = new NetworkStack(app, `stynx-${envName}-network`, {
  env: awsEnv,
  config,
});

const identity = new IdentityStack(app, `stynx-${envName}-identity`, {
  env: awsEnv,
  config,
});

const data = new DataStack(app, `stynx-${envName}-data`, {
  env: awsEnv,
  config,
  vpc: network.vpc,
});

const storage = new StorageStack(app, `stynx-${envName}-storage`, {
  env: awsEnv,
  config,
});

const compute = new ComputeStack(app, `stynx-${envName}-compute`, {
  env: awsEnv,
  crossRegionReferences: true,
  config,
  vpc: network.vpc,
  dbSecret: data.dbSecret,
  dbEndpoint: data.pgBouncerEndpoint,
  redisEndpoint: data.redisEndpoint,
  userPoolId: identity.userPool.userPoolId,
  userPoolClientId: identity.apiClient.userPoolClientId,
  docsBucket: storage.docsBucket,
  kmsDocsKey: storage.kmsDocsKey,
  imageTag,
});

const edge = new EdgeStack(app, `stynx-${envName}-edge`, {
  env: {
    account: config.accountId,
    region: 'us-east-1',
  },
  crossRegionReferences: true,
  config,
  alb: compute.alb,
});

const observability = new ObservabilityStack(app, `stynx-${envName}-observability`, {
  env: awsEnv,
  config,
  alb: compute.alb,
  ecsService: compute.service,
  db: data.db,
  redis: data.redis,
});

for (const stack of [network, identity, data, storage, compute, edge, observability]) {
  Tags.of(stack).add('stynx:env', envName);
  Tags.of(stack).add('stynx:managed', 'true');
  Tags.of(stack).add('stynx:owner', config.ownerTeam);
}

app.synth();
