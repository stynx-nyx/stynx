import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { RequestLike } from '../common/request-context';
import { DefaultSlaCategoryResolver } from './default-sla-category.resolver';
import { LoggerSlaEventSink } from './logger-sla-event.sink';
import type {
  SlaAggregateEvent,
  SlaCategory,
  SlaCategoryResolver,
  SlaEventSink,
  SlaMonitorInterceptorOptions,
  SlaSampleEvent,
} from './types';

const DEFAULT_OPTIONS: Required<
  Pick<SlaMonitorInterceptorOptions, 'aggregateEvery' | 'windowSize'>
> = {
  aggregateEvery: 20,
  windowSize: 200,
};

const DEFAULT_THRESHOLDS: Record<string, number> = {
  BIOMETRIC: 3000,
  RENACH: 10000,
  SIGNATURE: 15000,
};
const DEFAULT_FALLBACK_THRESHOLD_MS = 15000;

@Injectable()
export class SlaMonitorInterceptor implements NestInterceptor {
  private readonly thresholds: Record<string, number>;
  private readonly aggregateEvery: number;
  private readonly windowSize: number;
  private readonly latencyWindows = new Map<SlaCategory, number[]>();
  private readonly categoryCounters = new Map<SlaCategory, number>();
  private readonly categoryResolver: SlaCategoryResolver;
  private readonly sink: SlaEventSink;

  constructor(
    @Optional() options?: SlaMonitorInterceptorOptions,
    @Optional() categoryResolver?: SlaCategoryResolver,
    @Optional() sink?: SlaEventSink,
  ) {
    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...(options?.thresholdsMs ?? {}),
    };
    this.aggregateEvery = options?.aggregateEvery ?? DEFAULT_OPTIONS.aggregateEvery;
    this.windowSize = options?.windowSize ?? DEFAULT_OPTIONS.windowSize;
    this.categoryResolver = categoryResolver ?? new DefaultSlaCategoryResolver();
    this.sink = sink ?? new LoggerSlaEventSink();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const category = this.categoryResolver.resolve(request);
    const start = Date.now();

    return next.handle().pipe(
      tap(
        () => this.logSla(category, Date.now() - start, false),
        (error: unknown) => {
          this.logSla(category, Date.now() - start, true);
          throw error;
        },
      ),
    );
  }

  private logSla(
    category: SlaCategory | 'NONE',
    durationMs: number,
    requestError: boolean,
  ): void {
    if (category === 'NONE') return;
    const configured = this.thresholds[category];
    const threshold =
      typeof configured === 'number' ? configured : DEFAULT_FALLBACK_THRESHOLD_MS;
    const breach = durationMs > threshold;
    const sample: SlaSampleEvent = {
      category,
      thresholdMs: threshold,
      durationMs,
      breach,
      requestError,
      timestamp: new Date().toISOString(),
    };
    this.sink.sample(sample);
    this.recordAggregate(category, durationMs, threshold);
  }

  private recordAggregate(
    category: SlaCategory,
    durationMs: number,
    thresholdMs: number,
  ): void {
    const history = this.latencyWindows.get(category) ?? [];
    history.push(durationMs);
    if (history.length > this.windowSize) {
      history.splice(0, history.length - this.windowSize);
    }
    this.latencyWindows.set(category, history);

    const count = (this.categoryCounters.get(category) ?? 0) + 1;
    this.categoryCounters.set(category, count);
    if (count % this.aggregateEvery !== 0) return;

    const p50 = this.percentile(history, 50);
    const p95 = this.percentile(history, 95);
    const p99 = this.percentile(history, 99);
    const aggregate: SlaAggregateEvent = {
      category,
      samples: history.length,
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
      thresholdMs,
      breachP95: p95 > thresholdMs,
      timestamp: new Date().toISOString(),
    };
    this.sink.aggregate(aggregate);
  }

  private percentile(samples: number[], p: number): number {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const rank = Math.ceil((p / 100) * sorted.length) - 1;
    const index = Math.max(0, Math.min(rank, sorted.length - 1));
    return sorted[index] ?? 0;
  }
}
