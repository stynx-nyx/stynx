export type Awaitable<T> = T | Promise<T>;

export interface AuthProvider {
  getAccessToken(): Awaitable<string | null>;
  refresh(): Awaitable<string | null>;
  onAuthFailure?(error: unknown): Awaitable<void>;
}
