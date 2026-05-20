import { InjectionToken, makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { Observable } from 'rxjs';

export interface StynxFlowClient {
  get<T>(path: string, options?: unknown): Promise<T>;
  post<T>(path: string, body: unknown, options?: unknown): Promise<T>;
  put<T>(path: string, body: unknown, options?: unknown): Promise<T>;
  patch<T>(path: string, body: unknown, options?: unknown): Promise<T>;
  delete<T>(path: string, options?: unknown): Promise<T>;
}

export interface StynxFlowProviderOptions {
  clientFactory: () => StynxFlowClient;
  tenantChanged$?: Observable<unknown>;
}

export const STYNX_FLOW_CLIENT = new InjectionToken<StynxFlowClient>('STYNX_FLOW_CLIENT');
export const STYNX_FLOW_TENANT_CHANGED = new InjectionToken<Observable<unknown>>('STYNX_FLOW_TENANT_CHANGED');

export function provideStynxFlow(input: StynxFlowClient | StynxFlowProviderOptions): EnvironmentProviders {
  const providers = 'clientFactory' in input
    ? [
        {
          provide: STYNX_FLOW_CLIENT,
          useFactory: input.clientFactory,
        },
        ...(input.tenantChanged$
          ? [{
              provide: STYNX_FLOW_TENANT_CHANGED,
              useValue: input.tenantChanged$,
            }]
          : []),
      ]
    : [
        {
          provide: STYNX_FLOW_CLIENT,
          useValue: input,
        },
      ];

  return makeEnvironmentProviders([
    ...providers,
  ]);
}
