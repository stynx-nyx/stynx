import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import type {
  SlaAggregateEvent,
  SlaCategoryResolver,
  SlaEventSink,
  SlaSampleEvent,
} from '../../../packages/backend/src/sla/types';
import { SlaMonitorInterceptor } from '../../../packages/backend/src/sla/sla-monitor.interceptor';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('SlaMonitorInterceptor', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('emits sample event with threshold/breach information', async () => {
    const sink: SlaEventSink = {
      sample: vi.fn((_event: SlaSampleEvent) => undefined),
      aggregate: vi.fn((_event: SlaAggregateEvent) => undefined),
    };
    const resolver: SlaCategoryResolver = {
      resolve: vi.fn(() => 'RENACH'),
    };
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 120);
    const interceptor = new SlaMonitorInterceptor(
      { thresholdsMs: { RENACH: 100 }, aggregateEvery: 10 },
      resolver,
      sink,
    );
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext({ headers: {} }), next)),
    ).resolves.toEqual({ ok: true });

    expect(nowSpy).toHaveBeenCalled();
    expect(sink.sample).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'RENACH',
        thresholdMs: 100,
        durationMs: 120,
        breach: true,
        requestError: false,
      }),
    );
  });

  it('emits aggregate event according to configured sample window', async () => {
    const sink: SlaEventSink = {
      sample: vi.fn((_event: SlaSampleEvent) => undefined),
      aggregate: vi.fn((_event: SlaAggregateEvent) => undefined),
    };
    const resolver: SlaCategoryResolver = {
      resolve: vi.fn(() => 'RENACH'),
    };
    vi
      .spyOn(Date, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 120)
      .mockImplementationOnce(() => 200)
      .mockImplementationOnce(() => 280);
    const interceptor = new SlaMonitorInterceptor(
      { thresholdsMs: { RENACH: 100 }, aggregateEvery: 2, windowSize: 10 },
      resolver,
      sink,
    );
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    await lastValueFrom(interceptor.intercept(createExecutionContext({ headers: {} }), next));
    await lastValueFrom(interceptor.intercept(createExecutionContext({ headers: {} }), next));

    expect(sink.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'RENACH',
        samples: 2,
        p50Ms: 80,
        p95Ms: 120,
        p99Ms: 120,
        thresholdMs: 100,
        breachP95: true,
      }),
    );
  });

  it('emits error-path sample when downstream handler fails', async () => {
    const sink: SlaEventSink = {
      sample: vi.fn((_event: SlaSampleEvent) => undefined),
      aggregate: vi.fn((_event: SlaAggregateEvent) => undefined),
    };
    const resolver: SlaCategoryResolver = {
      resolve: vi.fn(() => 'SIGNATURE'),
    };
    vi
      .spyOn(Date, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 10);
    const interceptor = new SlaMonitorInterceptor({}, resolver, sink);
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext({ headers: {} }), next)),
    ).rejects.toThrow('boom');
    expect(sink.sample).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'SIGNATURE',
        requestError: true,
      }),
    );
  });
});
