import { BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import {
  TenantLifecycleMiddleware,
  createTenantLifecycleMiddleware,
} from '../../src/db-context/tenant-lifecycle.middleware';

function fakeResponse() {
  return new EventEmitter() as EventEmitter & { once: EventEmitter['once'] };
}

const VALID_UUID = '0190abcd-1234-7abc-89ab-0123456789ab';

describe('TenantLifecycleMiddleware', () => {
  it('throws BadRequestException when tenant header missing and required', () => {
    const mw = new TenantLifecycleMiddleware();
    const next = jest.fn();
    expect(() => mw.use({ headers: {} }, fakeResponse(), next)).toThrow(BadRequestException);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows missing header when requireTenantHeader=false', () => {
    const mw = new TenantLifecycleMiddleware({ requireTenantHeader: false });
    const next = jest.fn();
    mw.use({ headers: {} }, fakeResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('throws when header present but not a UUID and enforceTenantUuid=true', () => {
    const mw = new TenantLifecycleMiddleware();
    expect(() =>
      mw.use({ headers: { 'x-tenant-id': 'not-a-uuid' } }, fakeResponse(), jest.fn()),
    ).toThrow(BadRequestException);
  });

  it('accepts a non-UUID header when enforceTenantUuid=false', () => {
    const mw = new TenantLifecycleMiddleware({ enforceTenantUuid: false });
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': 'tenant-x' } };
    mw.use(request, fakeResponse(), jest.fn());
    expect(request.tenantId).toBe('tenant-x');
  });

  it('binds request.tenantId from the valid UUID header', () => {
    const mw = new TenantLifecycleMiddleware();
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': VALID_UUID } };
    mw.use(request, fakeResponse(), jest.fn());
    expect(request.tenantId).toBe(VALID_UUID);
  });

  it('reads from the array form of the header (takes first element)', () => {
    const mw = new TenantLifecycleMiddleware();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': [VALID_UUID, 'second-value'] },
    };
    mw.use(request, fakeResponse(), jest.fn());
    expect(request.tenantId).toBe(VALID_UUID);
  });

  it('falls back to the lowercased variant of the configured header name', () => {
    const mw = new TenantLifecycleMiddleware({
      tenantHeaderName: 'X-Custom-Tenant',
      enforceTenantUuid: false,
    });
    const request: Record<string, unknown> = {
      headers: { 'x-custom-tenant': 'tenant-low' },
    };
    mw.use(request, fakeResponse(), jest.fn());
    expect(request.tenantId).toBe('tenant-low');
  });

  it('releases the pgClient on response finish', async () => {
    const mw = new TenantLifecycleMiddleware();
    const release = jest.fn();
    const response = fakeResponse();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
      pgClient: { release },
    };
    mw.use(request, response, jest.fn());
    response.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not double-release on finish + close', async () => {
    const mw = new TenantLifecycleMiddleware();
    const release = jest.fn();
    const response = fakeResponse();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
      pgClient: { release },
    };
    mw.use(request, response, jest.fn());
    response.emit('finish');
    response.emit('close');
    await new Promise((r) => setImmediate(r));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('falls back to dbClient when pgClient is absent', async () => {
    const mw = new TenantLifecycleMiddleware();
    const release = jest.fn();
    const response = fakeResponse();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
      dbClient: { release },
    };
    mw.use(request, response, jest.fn());
    response.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(release).toHaveBeenCalled();
  });

  it('is a no-op when no client is attached to the request', async () => {
    const mw = new TenantLifecycleMiddleware();
    const response = fakeResponse();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
    };
    expect(() => mw.use(request, response, jest.fn())).not.toThrow();
    response.emit('finish');
    await new Promise((r) => setImmediate(r));
  });

  it('skips release bindings when response is not an EventEmitter', () => {
    const mw = new TenantLifecycleMiddleware();
    const release = jest.fn();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
      pgClient: { release },
    };
    mw.use(request, undefined, jest.fn());
    expect(release).not.toHaveBeenCalled();
  });

  it('createTenantLifecycleMiddleware returns a bound function form', () => {
    const middleware = createTenantLifecycleMiddleware({ enforceTenantUuid: false });
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': 'tenant-fn' } };
    const next = jest.fn();
    middleware(request, fakeResponse(), next);
    expect(request.tenantId).toBe('tenant-fn');
    expect(next).toHaveBeenCalledWith();
  });
});
