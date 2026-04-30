import type { EnvConfig } from './index';

export const dev: EnvConfig = {
  env: 'dev',
  accountId: '111111111111',
  region: 'sa-east-1',
  ownerTeam: 'platform',
  domain: 'dev.api.example.test',
  hostedZoneId: 'ZDEVEXAMPLETEST',
  hostedZoneName: 'example.test',
  certArn: 'arn:aws:acm:sa-east-1:111111111111:certificate/dev-placeholder',
  alarmRecipients: ['devops@example.test'],
  vpc: {
    cidr: '10.10.0.0/16',
    maxAzs: 2,
  },
  db: {
    instanceClass: 't4g.medium',
    storageGb: 100,
    multiAz: false,
    backupRetentionDays: 7,
    pgVersion: '16.3',
  },
  redis: {
    nodeType: 'cache.t4g.small',
    replicasPerNodeGroup: 1,
  },
  ecs: {
    imageRepositoryName: 'stynx-reference-api',
    cpu: 512,
    memory: 1024,
    desiredCount: 1,
    minCapacity: 1,
    maxCapacity: 2,
  },
};
