import type { SignatureBackend } from './types.js';

const mocks = new WeakSet<object>();
export function markMockSignatureBackend<T extends SignatureBackend>(backend:T):T {
  mocks.add(backend);
  return backend;
}
export function isMockSignatureBackend(backend:object):boolean { return mocks.has(backend); }
