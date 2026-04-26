import type { ApiRequestOptions } from './http';
import { StynxHttpTransport, type StynxHttpTransportOptions } from './transport';

export class StynxSdkClient {
  readonly transport: StynxHttpTransport;

  constructor(options: StynxHttpTransportOptions) {
    this.transport = new StynxHttpTransport(options);
  }

  get<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    return this.transport.request<T>({
      method: 'GET',
      path,
      ...options,
    });
  }

  post<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<T> {
    return this.transport.request<T>({
      method: 'POST',
      path,
      body,
      ...options,
    });
  }

  put<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<T> {
    return this.transport.request<T>({
      method: 'PUT',
      path,
      body,
      ...options,
    });
  }

  patch<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<T> {
    return this.transport.request<T>({
      method: 'PATCH',
      path,
      body,
      ...options,
    });
  }

  delete<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    return this.transport.request<T>({
      method: 'DELETE',
      path,
      ...options,
    });
  }
}
