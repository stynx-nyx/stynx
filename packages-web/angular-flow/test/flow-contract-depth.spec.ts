import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import { describe, expect, it, vi } from 'vitest';
import { FlowApiService } from '../src/flow-api.service';
import { STYNX_FLOW_CLIENT } from '../src/tokens';

type ClientCall = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
  body?: unknown;
  options?: unknown;
};

function createClient(): StynxSdkClient & { calls: ClientCall[] } {
  const calls: ClientCall[] = [];
  return {
    calls,
    transport: { request: vi.fn(async () => ({})) } as unknown as StynxSdkClient['transport'],
    get: vi.fn(async (path: string, options?: unknown) => {
      calls.push({ method: 'GET', path, options });
      return {};
    }),
    post: vi.fn(async (path: string, body: unknown, options?: unknown) => {
      calls.push({ method: 'POST', path, body, options });
      return {};
    }),
    patch: vi.fn(async (path: string, body: unknown, options?: unknown) => {
      calls.push({ method: 'PATCH', path, body, options });
      return {};
    }),
    put: vi.fn(async (path: string, body: unknown, options?: unknown) => {
      calls.push({ method: 'PUT', path, body, options });
      return {};
    }),
    delete: vi.fn(async (path: string, options?: unknown) => {
      calls.push({ method: 'DELETE', path, options });
      return {};
    }),
  } as StynxSdkClient & { calls: ClientCall[] };
}

function createApi(client: StynxSdkClient): FlowApiService {
  const injector = Injector.create({
    providers: [{ provide: STYNX_FLOW_CLIENT, useValue: client }],
  });
  return runInInjectionContext(injector, () => new FlowApiService());
}

describe('@stynx-nyx/angular-flow W04 contract depth', () => {
  it('submits task action routes with exact Flow API body shapes', async () => {
    const client = createClient();
    const api = createApi(client);

    await api.acceptTask('task-1', 'claiming work');
    await api.actTask('task-1', 'complete', 'completed with evidence');
    await api.assignTask('task-1', 'user-2', 'handoff');
    await api.withdrawTask('task-1', 'not needed');

    expect(client.calls).toEqual([
      { method: 'POST', path: '/flow/tasks/task-1/accept', body: { note: 'claiming work' }, options: undefined },
      { method: 'POST', path: '/flow/tasks/task-1/act', body: { action: 'complete', note: 'completed with evidence' }, options: undefined },
      { method: 'POST', path: '/flow/tasks/task-1/assign', body: { userId: 'user-2', note: 'handoff' }, options: undefined },
      { method: 'POST', path: '/flow/tasks/task-1/withdraw', body: { note: 'not needed' }, options: undefined },
    ]);
  });

  it('keeps draft publish requests separate from runtime reads and only sends Idempotency-Key when supplied', async () => {
    const client = createClient();
    const api = createApi(client);

    await api.publishGraph('graph-1', { expectedDraftVersion: 'draft-v2' });
    await api.publishGraph('graph-1', { expectedDraftVersion: 'draft-v2', notes: 'W04 publish' }, 'publish-key-1');
    await api.listRuns({ graphId: 'graph-1', status: 'active' });

    expect(client.calls).toEqual([
      {
        method: 'POST',
        path: '/flow/graphs/graph-1/publish',
        body: { expectedDraftVersion: 'draft-v2' },
        options: undefined,
      },
      {
        method: 'POST',
        path: '/flow/graphs/graph-1/publish',
        body: { expectedDraftVersion: 'draft-v2', notes: 'W04 publish' },
        options: { headers: { 'Idempotency-Key': 'publish-key-1' } },
      },
      {
        method: 'GET',
        path: '/flow/runs',
        options: { query: { graphId: 'graph-1', status: 'active' } },
      },
    ]);
  });
});
