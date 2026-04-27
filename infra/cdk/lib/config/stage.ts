import type { EnvConfig } from './index';

export const stage: EnvConfig = {
  env: 'stage',
  accountId: '222222222222',
  region: 'sa-east-1',
  ownerTeam: 'platform',
  domain: 'stage.api.example.test',
  hostedZoneId: 'ZSTAGEEXAMPLETEST',
  hostedZoneName: 'example.test',
  certArn: 'arn:aws:acm:sa-east-1:222222222222:certificate/stage-placeholder',
  alarmRecipients: ['stage-ops@example.test'],
  vpc: {
    cidr: '10.15.0.0/16',
    maxAzs: 2,
  },
  db: {
    instanceClass: 't4g.large',
    storageGb: 200,
    multiAz: true,
    backupRetentionDays: 14,
    pgVersion: '16.3',
  },
  redis: {
    nodeType: 'cache.t4g.medium',
    replicasPerNodeGroup: 1,
  },
  ecs: {
    imageRepositoryName: 'stynx-reference-api',
    cpu: 1024,
    memory: 2048,
    desiredCount: 2,
    minCapacity: 2,
    maxCapacity: 6,
  },
};
