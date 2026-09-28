import type { SignatureBackend } from './types';

const mocks = new WeakSet<object>();
export function markMockSignatureBackend<T extends SignatureBackend>(backend:T):T {
  mocks.add(backend);
  return backend;
}
export function isMockSignatureBackend(backend:object):boolean { return mocks.has(backend); }
