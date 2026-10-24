import type { ApiRequestOptions } from './http';
import { StynxHttpTransport, type StynxHttpTransportOptions } from './transport';

export class StynxSdkClient {
  readonly transport: StynxHttpTransport;

  constructor(options: StynxHttpTransportOptions) {
    this.transport = new StynxHttpTransport(options);
  }

  get(path: string, options: ApiRequestOptions = {}): Promise<unknown> {
    return this.transport.request({
      method: 'GET',
      path,
      ...options,
    });
  }

  post(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<unknown> {
    return this.transport.request({
      method: 'POST',
      path,
      body,
      ...options,
    });
  }

  put(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<unknown> {
    return this.transport.request({
      method: 'PUT',
      path,
      body,
      ...options,
    });
  }

  patch(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<unknown> {
    return this.transport.request({
      method: 'PATCH',
      path,
      body,
      ...options,
    });
  }

  delete(path: string, options: ApiRequestOptions = {}): Promise<unknown> {
    return this.transport.request({
      method: 'DELETE',
      path,
      ...options,
    });
  }
}
