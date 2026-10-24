import { verifyAuthMutationCoverage } from '../../src/doctor.js';

describe('verifyAuthMutationCoverage', () => {
  it('tracks the six ADR-002 mutation paths exactly', () => {
    expect(verifyAuthMutationCoverage()).toEqual({
      ok: true,
      missing: [],
      extra: [],
    });
  });
});


it('reads mutation prototype getters with their original receiver and preserves own-name order', async () => {
  const { EffectiveHashComputer } = await import('../../src/effective-hash-computer.js');
  const prototype = EffectiveHashComputer.prototype;
  const receivers: unknown[] = []; const order: string[] = [];
  Object.defineProperty(prototype, 'afterInspectorFirst', { configurable: true, get() { receivers.push(this); order.push('first'); return () => undefined; } });
  Object.defineProperty(prototype, 'afterInspectorSecond', { configurable: true, get() { receivers.push(this); order.push('second'); return () => undefined; } });
  try {
    expect(verifyAuthMutationCoverage()).toEqual({ ok: false, missing: [], extra: ['afterInspectorFirst', 'afterInspectorSecond'] });
    expect(receivers).toEqual([prototype, prototype]); expect(order).toEqual(['first', 'second']);
  } finally {
    Reflect.deleteProperty(prototype, 'afterInspectorFirst'); Reflect.deleteProperty(prototype, 'afterInspectorSecond');
  }
});
