import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError, Observable, lastValueFrom } from 'rxjs';
import { AuditInterceptor } from '../../src/audit/audit.interceptor';

class FakeReflector extends Reflector {
  constructor(private readonly metadata?: unknown) {
    super();
  }
  getAllAndOverride<T>(): T | undefined {
    return this.metadata as T | undefined;
  }
}

class TestController {}

function ctx(request: Record<string, unknown>, handler: Function = () => undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown = { id: 'entity-1' }, observable?: Observable<unknown>): CallHandler {
  return { handle: () => observable ?? of(value) };
}

const PRINCIPAL = {
  id: 'p-1',
  roles: ['admin', 'member'],
  permissions: [],
  tenants: ['t-1'],
  claims: {},
};

describe('AuditInterceptor', () => {
  it('passes through when no audit metadata is set on the handler', async () => {
    const sink = { write: vi.fn() };
    const interceptor = new AuditInterceptor(new FakeReflector(undefined), sink);
    const result = await lastValueFrom(interceptor.intercept(ctx({ headers: {} }), makeHandler()));
    expect(result).toEqual({ id: 'entity-1' });
    expect(sink.write).not.toHaveBeenCalled();
  });

  it('writes an envelope with action/entity/entityId/tenantId/actorId/role', async () => {
    const sink = { write: vi.fn(async () => undefined) };
    const reflector = new FakeReflector({ action: 'doc.created', entity: 'Document' });
    const interceptor = new AuditInterceptor(reflector, sink);
    const request = { headers: {}, principal: PRINCIPAL, tenantId: 't-1', requestId: 'req-1' };
    await lastValueFrom(interceptor.intercept(ctx(request), makeHandler({ id: 'doc-9' })));
    expect(sink.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'doc.created',
        entity: 'Document',
        entityId: 'doc-9',
        tenantId: 't-1',
        actorId: 'p-1',
        actorRole: 'admin',
        requestId: 'req-1',
      }),
    );
  });

  it('falls back to the controller class name when entity is not set', async () => {
    const sink = { write: vi.fn(async () => undefined) };
    const reflector = new FakeReflector({ action: 'a' });
    const interceptor = new AuditInterceptor(reflector, sink);
    await lastValueFrom(interceptor.intercept(ctx({ headers: {} }), makeHandler()));
    expect((sink.write.mock.calls[0]![0] as { entity: string }).entity).toBe('TestController');
  });

  it('honors entityIdSelector and metadataSelector', async () => {
    const sink = { write: vi.fn(async () => undefined) };
    const reflector = new FakeReflector({
      action: 'a',
      entityIdSelector: (req: Record<string, unknown>) => (req.body as { customId: string }).customId,
      metadataSelector: (req: Record<string, unknown>) => ({ ip: req.ip, secret: 'x' }),
    });
    const interceptor = new AuditInterceptor(reflector, sink);
    const request = { headers: {}, body: { customId: 'cust-1' }, ip: '1.2.3.4' };
    await lastValueFrom(interceptor.intercept(ctx(request), makeHandler({})));
    expect((sink.write.mock.calls[0]![0] as { entityId: string }).entityId).toBe('cust-1');
    expect((sink.write.mock.calls[0]![0] as { metadata: unknown }).metadata).toEqual({
      ip: '1.2.3.4',
      secret: 'x',
    });
  });

  it('runs metadata through the redaction policy when configured', async () => {
    const sink = { write: vi.fn(async () => undefined) };
    const policy = { redact: vi.fn((meta: unknown) => ({ redacted: true, _: meta })) };
    const reflector = new FakeReflector({
      action: 'a',
      metadataSelector: () => ({ password: 'secret' }),
    });
    const interceptor = new AuditInterceptor(reflector, sink, policy);
    await lastValueFrom(interceptor.intercept(ctx({ headers: {} }), makeHandler({})));
    expect(policy.redact).toHaveBeenCalled();
    expect((sink.write.mock.calls[0]![0] as { metadata: unknown }).metadata).toEqual({
      redacted: true,
      _: { password: 'secret' },
    });
  });

  it('omits entityId when inference yields nothing', async () => {
    const sink = { write: vi.fn(async () => undefined) };
    const reflector = new FakeReflector({ action: 'a' });
    const interceptor = new AuditInterceptor(reflector, sink);
    await lastValueFrom(interceptor.intercept(ctx({ headers: {} }), makeHandler(null)));
    const envelope = sink.write.mock.calls[0]![0] as Record<string, unknown>;
    expect(envelope).not.toHaveProperty('entityId');
  });

  it('logs but does not fail the request when sink.write throws', async () => {
    const sink = { write: vi.fn(async () => { throw new Error('sink down'); }) };
    const reflector = new FakeReflector({ action: 'a' });
    const interceptor = new AuditInterceptor(reflector, sink);
    const result = await lastValueFrom(
      interceptor.intercept(ctx({ headers: {} }), makeHandler({ id: 'x' })),
    );
    expect(result).toEqual({ id: 'x' });
  });

  it('propagates handler errors', async () => {
    const sink = { write: vi.fn() };
    const reflector = new FakeReflector({ action: 'a' });
    const interceptor = new AuditInterceptor(reflector, sink);
    const handler = makeHandler(undefined, throwError(() => new Error('boom')));
    await expect(
      lastValueFrom(interceptor.intercept(ctx({ headers: {} }), handler)),
    ).rejects.toThrow('boom');
  });
});
