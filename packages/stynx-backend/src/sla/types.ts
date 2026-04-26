import type { RequestLike } from '../common/request-context';

export type SlaCategory = string;

export interface SlaSampleEvent {
  category: SlaCategory;
  thresholdMs: number;
  durationMs: number;
  breach: boolean;
  requestError: boolean;
  timestamp: string;
}

export interface SlaAggregateEvent {
  category: SlaCategory;
  samples: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  thresholdMs: number;
  breachP95: boolean;
  timestamp: string;
}

export interface SlaEventSink {
  sample(event: SlaSampleEvent): void;
  aggregate(event: SlaAggregateEvent): void;
}

export interface SlaCategoryResolver {
  resolve(request: RequestLike): SlaCategory | 'NONE';
}

export interface SlaMonitorInterceptorOptions {
  thresholdsMs?: Record<string, number>;
  aggregateEvery?: number;
  windowSize?: number;
}
