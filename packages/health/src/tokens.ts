export interface StynxHealthIndicatorResult {
  status: 'up' | 'down';
  details?: Record<string, unknown>;
}

export interface StynxHealthIndicator {
  name: string;
  check(): Promise<StynxHealthIndicatorResult>;
}

export interface StynxHealthModuleOptions {
  metricsIpAllowlist?: string[];
  infoFlagEnvVar?: string;
  appInfo?: Record<string, unknown>;
  pgCheck?: () => Promise<void>;
  redisCheck?: () => Promise<void>;
  jwksCheck?: () => Promise<void>;
  s3Check?: () => Promise<void>;
}

export const STYNX_HEALTH_OPTIONS = Symbol('STYNX_HEALTH_OPTIONS');
export const STYNX_HEALTH_INDICATORS = Symbol('STYNX_HEALTH_INDICATORS');
