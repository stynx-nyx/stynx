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
    const next = vi.fn();
    expect(() => mw.use({ headers: {} }, fakeResponse(), next)).toThrow(BadRequestException);
    expect(next).not.toHaveBeenCalledTimes(1);
  });

  it('reports the exact configured header when the required tenant header is missing', () => {
    const mw = new TenantLifecycleMiddleware({ tenantHeaderName: 'X-Custom-Tenant' });
    expect(() => mw.use({ headers: {} }, fakeResponse(), vi.fn())).toThrow(
      'X-Custom-Tenant header is required',
    );
  });

  it('allows missing header when requireTenantHeader=false', () => {
    const mw = new TenantLifecycleMiddleware({ requireTenantHeader: false });
    const next = vi.fn();
    mw.use({ headers: {} }, fakeResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('throws when header present but not a UUID and enforceTenantUuid=true', () => {
    const mw = new TenantLifecycleMiddleware();
    expect(() =>
      mw.use({ headers: { 'x-tenant-id': 'not-a-uuid' } }, fakeResponse(), vi.fn()),
    ).toThrow(BadRequestException);
  });

  it.each([`${VALID_UUID}suffix`, `prefix${VALID_UUID}`])(
    'rejects UUID-shaped tenant values with extra characters: %s',
    (tenantId) => {
      const mw = new TenantLifecycleMiddleware();
      expect(() =>
        mw.use({ headers: { 'x-tenant-id': tenantId } }, fakeResponse(), vi.fn()),
      ).toThrow('x-tenant-id must be a UUID');
    },
  );

  it('accepts a non-UUID header when enforceTenantUuid=false', () => {
    const mw = new TenantLifecycleMiddleware({ enforceTenantUuid: false });
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': 'tenant-x' } };
    mw.use(request, fakeResponse(), vi.fn());
    expect(request.tenantId).toBe('tenant-x');
  });

  it('trims the configured tenant header before assigning it', () => {
    const mw = new TenantLifecycleMiddleware({ enforceTenantUuid: false });
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': '  tenant-x  ' } };
    mw.use(request, fakeResponse(), vi.fn());
    expect(request.tenantId).toBe('tenant-x');
  });

  it('binds request.tenantId from the valid UUID header', () => {
    const mw = new TenantLifecycleMiddleware();
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': VALID_UUID } };
    mw.use(request, fakeResponse(), vi.fn());
    expect(request.tenantId).toBe(VALID_UUID);
  });

  it('reads from the array form of the header (takes first element)', () => {
    const mw = new TenantLifecycleMiddleware();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': [VALID_UUID, 'second-value'] },
    };
    mw.use(request, fakeResponse(), vi.fn());
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
    mw.use(request, fakeResponse(), vi.fn());
    expect(request.tenantId).toBe('tenant-low');
  });

  it('ignores a blank configured-name value and uses the lowercased header value', () => {
    const mw = new TenantLifecycleMiddleware({
      tenantHeaderName: 'X-Custom-Tenant',
      enforceTenantUuid: false,
    });
    const request: Record<string, unknown> = {
      headers: { 'X-Custom-Tenant': '   ', 'x-custom-tenant': '  tenant-low  ' },
    };
    mw.use(request, fakeResponse(), vi.fn());
    expect(request.tenantId).toBe('tenant-low');
  });

  it('treats blank string and non-string tenant header values as missing', () => {
    const mw = new TenantLifecycleMiddleware();
    expect(() =>
      mw.use({ headers: { 'x-tenant-id': [' ', VALID_UUID] } }, fakeResponse(), vi.fn()),
    ).toThrow('x-tenant-id header is required');
    expect(() =>
      mw.use({ headers: { 'x-tenant-id': 42 } }, fakeResponse(), vi.fn()),
    ).toThrow('x-tenant-id header is required');
  });

  it('releases the pgClient on response finish', async () => {
    const mw = new TenantLifecycleMiddleware();
    const release = vi.fn();
    const response = fakeResponse();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
      pgClient: { release },
    };
    mw.use(request, response, vi.fn());
    response.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not double-release on finish + close', async () => {
    const mw = new TenantLifecycleMiddleware();
    const release = vi.fn();
    const response = fakeResponse();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
      pgClient: { release },
    };
    mw.use(request, response, vi.fn());
    response.emit('finish');
    response.emit('close');
    await new Promise((r) => setImmediate(r));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('honors custom release events, request client keys, and method names', async () => {
    const mw = new TenantLifecycleMiddleware({
      releaseEvents: ['close'],
      requestClientKeys: ['customClient'],
      releaseMethodName: 'dispose',
    });
    const dispose = vi.fn();
    const response = fakeResponse();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
      customClient: { dispose },
      pgClient: { release: vi.fn() },
    };
    mw.use(request, response, vi.fn());
    response.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(dispose).not.toHaveBeenCalled();
    response.emit('close');
    response.emit('close');
    await new Promise((r) => setImmediate(r));
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('falls back to dbClient when pgClient is absent', async () => {
    const mw = new TenantLifecycleMiddleware();
    const release = vi.fn();
    const response = fakeResponse();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
      dbClient: { release },
    };
    mw.use(request, response, vi.fn());
    response.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no client is attached to the request', async () => {
    const mw = new TenantLifecycleMiddleware();
    const response = fakeResponse();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
    };
    expect(() => mw.use(request, response, vi.fn())).not.toThrow();
    response.emit('finish');
    await new Promise((r) => setImmediate(r));
  });

  it('skips release bindings when response is not an EventEmitter', () => {
    const mw = new TenantLifecycleMiddleware();
    const release = vi.fn();
    const request: Record<string, unknown> = {
      headers: { 'x-tenant-id': VALID_UUID },
      pgClient: { release },
    };
    mw.use(request, undefined, vi.fn());
    expect(release).not.toHaveBeenCalledTimes(1);
  });

  it('createTenantLifecycleMiddleware returns a bound function form', () => {
    const middleware = createTenantLifecycleMiddleware({ enforceTenantUuid: false });
    const request: Record<string, unknown> = { headers: { 'x-tenant-id': 'tenant-fn' } };
    const next = vi.fn();
    middleware(request, fakeResponse(), next);
    expect(request.tenantId).toBe('tenant-fn');
    expect(next).toHaveBeenCalledWith();
  });
});
