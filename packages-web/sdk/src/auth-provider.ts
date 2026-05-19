export type Awaitable<T> = T | Promise<T>;

export interface AuthProvider {
  getAccessToken(): Awaitable<string | null>;
  refresh(): Awaitable<string | null>;
  loginRedirect?(): Awaitable<void>;
  onAuthFailure?(error: unknown): Awaitable<void>;
}
