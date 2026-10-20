import { withActor, withTenant } from '../src/context.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function makeMutator() {
  return {
    runWithRequestContext: vi.fn((_frame: unknown, fn: () => Promise<unknown>) => fn()),
  };
}

describe('request context helpers', () => {
  it('runs a callback under a tenant with the default actor', async () => {
    const mutator = makeMutator();

    await expect(withTenant(mutator as never, 'tenant-1', async () => 'tenant-result')).resolves.toBe(
      'tenant-result',
    );

    const [frame] = mutator.runWithRequestContext.mock.calls[0]!;
    expect(frame).toEqual({
      requestId: expect.stringMatching(UUID_V7),
      tenantId: 'tenant-1',
      actorId: '00000000-0000-0000-0000-000000000001',
      startedAt: expect.any(Date),
    });
  });

  it('runs a callback as an actor under the default or a given tenant', async () => {
    const mutator = makeMutator();

    await expect(withActor(mutator as never, 'actor-1', async () => 'default-tenant')).resolves.toBe(
      'default-tenant',
    );
    await expect(
      withActor(mutator as never, 'actor-2', async () => 'given-tenant', 'tenant-2'),
    ).resolves.toBe('given-tenant');

    const frames = mutator.runWithRequestContext.mock.calls.map(([frame]) => frame);
    expect(frames).toEqual([
      expect.objectContaining({ tenantId: '00000000-0000-0000-0000-000000000001', actorId: 'actor-1' }),
      expect.objectContaining({ tenantId: 'tenant-2', actorId: 'actor-2' }),
    ]);
    expect(frames[0]).not.toHaveProperty('sessionId');
  });
});
