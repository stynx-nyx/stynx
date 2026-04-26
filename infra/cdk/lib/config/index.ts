import { dev } from './dev';
import { prod } from './prod';
import { stage } from './stage';

export type EnvName = 'dev' | 'stage' | 'prod';

export interface EnvConfig {
  env: EnvName;
  accountId: string;
  region: string;
  ownerTeam: string;
  domain: string;
  certArn: string;
  alarmRecipients: string[];
  vpc: {
    cidr: string;
    maxAzs: number;
  };
  db: {
    instanceClass: string;
    storageGb: number;
    multiAz: boolean;
    backupRetentionDays: number;
    pgVersion: string;
  };
  redis: {
    nodeType: string;
    replicasPerNodeGroup: number;
  };
  ecs: {
    imageRepositoryName: string;
    cpu: number;
    memory: number;
    desiredCount: number;
    minCapacity: number;
    maxCapacity: number;
  };
}

const configs: Record<EnvName, EnvConfig> = {
  dev,
  stage,
  prod,
};

export function loadEnvConfig(env: EnvName): EnvConfig {
  return configs[env];
}
