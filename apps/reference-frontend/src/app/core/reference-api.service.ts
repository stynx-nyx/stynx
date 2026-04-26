import { inject, Injectable } from '@angular/core';
import type { FetchLike, HttpRequestInitLike, HttpResponseLike } from '@stech/stynx-frontend-contracts';
import { StynxApiClient } from '@stech/stynx-frontend-client';
import { environment } from '../../environments/environment';
import { ReferenceAuthFacade } from './reference-auth.facade';

interface BrowserHeadersLike {
  get(name: string): string | null;
}

const browserFetchAdapter: FetchLike = async (
  url: string,
  init?: HttpRequestInitLike,
): Promise<HttpResponseLike> => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available');
  }

  const response = await fetch(url, {
    ...(init?.method ? { method: init.method } : {}),
    ...(init?.headers ? { headers: init.headers } : {}),
    ...(init?.body ? { body: init.body } : {}),
    ...(init?.signal ? { signal: init.signal as AbortSignal } : {}),
  });

  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers as BrowserHeadersLike,
    text: () => response.text(),
  };
};

@Injectable({ providedIn: 'root' })
export class ReferenceApiService {
  private readonly auth = inject(ReferenceAuthFacade);
  private readonly client: StynxApiClient;

  constructor() {
    this.client = new StynxApiClient({
      baseUrl: environment.apiBaseUrl,
      fetchFn: browserFetchAdapter,
      sessionManager: this.auth.getSessionManager(),
      tenantResolver: () => this.auth.getPreferredTenantId(),
      defaultHeaders: {
        'x-stynx-source': 'reference-frontend',
      },
    });
  }

  getHealth(): Promise<{ status: string; timestamp?: string }> {
    return this.client.get('/health');
  }
}
