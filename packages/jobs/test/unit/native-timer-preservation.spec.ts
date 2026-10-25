import { JobsScheduler } from '../../src/jobs.scheduler.js';
import { JobsWorker } from '../../src/jobs.worker.js';
import { JobsRegistry } from '../../src/jobs.registry.js';
import { parseCronExpression } from '../../src/cron.js';
import type { SchedulerOptions, TimerHandle, TimerPort } from '../../src/types.js';

function construct(kind: 'scheduler' | 'worker', options: SchedulerOptions) {
  const result: unknown = kind === 'scheduler'
    ? Reflect.construct(JobsScheduler, [{}, options])
    : Reflect.construct(JobsWorker, [{}, new JobsRegistry(), options]);
  if (!(result instanceof JobsScheduler) && !(result instanceof JobsWorker)) throw new Error('Actual Jobs class required');
  return result;
}

function captureError(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error('Expected the original error');
}

describe.each(['scheduler', 'worker'] as const)('%s native timer boundary', kind => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('re-reads a changed timer port at stop and preserves original handle and method receiver', () => {
    const events: string[] = [];
    const handle = { unref() { expect(this).toBe(handle); events.push('unref'); } };
    const first: TimerPort = { setInterval(_callback, ms) { expect(this).toBe(first); expect(ms).toBe(17); events.push('set'); return handle; }, clearInterval() { throw new Error('obsolete port'); } };
    const second: TimerPort = { setInterval() { throw new Error('unused'); }, clearInterval(value) { expect(this).toBe(second); expect(value).toBe(handle); events.push('clear'); } };
    let current = first;
    const options = { pollIntervalMs: 17, get timer() { events.push('timer'); return current; } };
    const instance = construct(kind, options); instance.start(); current = second; instance.stop(); instance.stop();
    expect(events).toEqual(['timer', 'set', 'unref', 'timer', 'clear']);
  });
  it('passes an injected opaque handle to the actual native clear function when the port disappears', () => {
    const handle = { opaque: { retained: true }, unref() {} };
    const options: SchedulerOptions = { timer: { setInterval: () => handle, clearInterval: () => { throw new Error('obsolete'); } } };
    const native = vi.spyOn(globalThis, 'clearInterval');
    const instance = construct(kind, options); instance.start(); delete options.timer; instance.stop(); instance.stop();
    expect(native).toHaveBeenCalledTimes(1); expect(native).toHaveBeenCalledWith(handle);
  });
  it('retains the timer after native failure and clears it only after a successful retry', () => {
    const sentinel = new Error('native clear sentinel'); const handle: TimerHandle = {};
    const options: SchedulerOptions = { timer: { setInterval: () => handle, clearInterval() {} } };
    const instance = construct(kind, options); instance.start(); delete options.timer;
    const native = vi.spyOn(globalThis, 'clearInterval').mockImplementationOnce(() => { throw sentinel; }).mockImplementation(() => undefined);
    expect(captureError(() => instance.stop())).toBe(sentinel); instance.stop(); instance.stop();
    expect(native).toHaveBeenCalledTimes(2); expect(native.mock.calls[0]?.[0]).toBe(handle); expect(native.mock.calls[1]?.[0]).toBe(handle);
  });
  it('preserves port getter and clear-method getter failures without clearing ownership', () => {
    const sentinel = new Error('getter sentinel'); const handle: TimerHandle = {};
    let throwing = false; let reads = 0;
    const timer: TimerPort = { setInterval: () => handle, get clearInterval() { reads += 1; if (throwing) throw sentinel; return value => { expect(value).toBe(handle); }; } };
    const options = { get timer() { if (throwing && reads === 0) throw sentinel; return timer; } };
    const instance = construct(kind, options); instance.start(); throwing = true;
    expect(captureError(() => instance.stop())).toBe(sentinel); expect(reads).toBe(0);
    reads = 1; expect(captureError(() => instance.stop())).toBe(sentinel); expect(reads).toBe(2);
    throwing = false; instance.stop(); instance.stop(); expect(reads).toBe(3);
  });
  it('stores ownership before unref and preserves unref error identity', () => {
    const sentinel = new Error('unref sentinel'); const cleared = vi.fn();
    const handle = { unref() { throw sentinel; } };
    const instance = construct(kind, { timer: { setInterval: () => handle, clearInterval: cleared } });
    expect(captureError(() => instance.start())).toBe(sentinel); instance.stop(); expect(cleared).toHaveBeenCalledExactlyOnceWith(handle);
  });
  it('does not allocate or read timer when explicitly disabled', () => {
    const instance = construct(kind, { enabled: false, get timer() { throw new Error('timer should not be read'); } });
    expect(() => { instance.start(); instance.stop(); }).not.toThrow();
  });
});

describe('cron tuple and capture inputs', () => {
  it.each(['* * * * *', '0-59/7 1,2 1-31 1-12 0-6', '5/10 0 1 1 0', '  1\t2 3 4 5  '])('retains valid parsed fields: %s', expression => {
    const parsed = parseCronExpression(expression);
    expect(parsed.minute.size).toBeGreaterThan(0); expect(parsed.hour.size).toBeGreaterThan(0);
  });
  it.each(['', '* * * *', '* * * * * *', '/2 * * * *', '1/ * * * *', '1/2/3 * * * *', '*/0 * * * *', 'a * * * *', '2-1 * * * *', '60 * * * *', '1,,2 * * * *'])('retains native invalid cron refusal: %s', expression => {
    expect(() => parseCronExpression(expression)).toThrow('Invalid cron');
  });
});
