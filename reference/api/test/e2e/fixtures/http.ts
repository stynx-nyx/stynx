import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface AuthenticatedAgent {
  get(path: string): request.Test;
  post(path: string): request.Test;
  patch(path: string): request.Test;
  delete(path: string): request.Test;
}

export function createAuthenticatedAgent(app: INestApplication, token: string): AuthenticatedAgent {
  let idempotencyCounter = 0;
  const nextKey = (method: string) => `records-notes-${method}-${++idempotencyCounter}`;
  const authenticated = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    request(app.getHttpServer())[method](path).set('authorization', `Bearer ${token}`);

  return {
    get: (path: string) => authenticated('get', path),
    post: (path: string) => authenticated('post', path).set('Idempotency-Key', nextKey('post')),
    patch: (path: string) => authenticated('patch', path).set('Idempotency-Key', nextKey('patch')),
    delete: (path: string) => authenticated('delete', path).set('Idempotency-Key', nextKey('delete')),
  };
}
