import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { provideStynxClock, STYNX_CLOCK, SystemClock, type Clock } from '../../src';

describe('Clock', () => {
  it('returns a fresh valid Date from SystemClock on every call', () => {
    const clock = new SystemClock();
    const first = clock.now();
    const second = clock.now();

    expect(first).toBeInstanceOf(Date);
    expect(Number.isFinite(first.getTime())).toBe(true);
    expect(second).not.toBe(first);
  });

  it('provides SystemClock by default through Nest injection', async () => {
    const module = await Test.createTestingModule({ providers: [provideStynxClock()] }).compile();
    const clock = module.get<Clock>(STYNX_CLOCK);

    expect(clock).toBeInstanceOf(SystemClock);
    expect(clock.now()).toBeInstanceOf(Date);
    await module.close();
  });

  it('injects the supplied clock instance unchanged through Nest', async () => {
    const fixed = new Date('2024-02-29T23:59:59.123Z');
    const clock: Clock = { now: vi.fn(() => new Date(fixed)) };
    const module = await Test.createTestingModule({ providers: [provideStynxClock(clock)] }).compile();

    expect(module.get<Clock>(STYNX_CLOCK)).toBe(clock);
    expect(module.get<Clock>(STYNX_CLOCK).now()).toEqual(fixed);
    expect(clock.now).toHaveBeenCalledOnce();
    await module.close();
  });
});
