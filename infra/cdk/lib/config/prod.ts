import type { EnvConfig } from './index';

export const prod: EnvConfig = {
  env: 'prod',
  accountId: '333333333333',
  region: 'sa-east-1',
  ownerTeam: 'platform',
  domain: 'api.example.com',
  hostedZoneId: 'ZPRODEXAMPLECOM',
  hostedZoneName: 'example.com',
  certArn: 'arn:aws:acm:sa-east-1:333333333333:certificate/prod-placeholder',
  alarmRecipients: ['platform@example.com'],
  vpc: {
    cidr: '10.20.0.0/16',
    maxAzs: 3,
  },
  db: {
    instanceClass: 'r6g.xlarge',
    storageGb: 500,
    multiAz: true,
    backupRetentionDays: 30,
    pgVersion: '16.3',
  },
  redis: {
    nodeType: 'cache.r6g.large',
    replicasPerNodeGroup: 1,
  },
  ecs: {
    imageRepositoryName: 'stynx-reference-api',
    cpu: 2048,
    memory: 4096,
    desiredCount: 3,
    minCapacity: 3,
    maxCapacity: 20,
  },
};
