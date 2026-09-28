import type { Provider } from '@nestjs/common';

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export const STYNX_CLOCK = Symbol('STYNX_CLOCK');

export function provideStynxClock(clock: Clock = new SystemClock()): Provider {
  return { provide: STYNX_CLOCK, useValue: clock };
}
