import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { AuditInterceptor } from '../../../packages/stynx-backend/src/audit/audit.interceptor';
import { PatternAuditMetadataRedactionPolicy } from '../../../packages/stynx-backend/src/audit/redaction-policy';
import type { AuditMetadata } from '../../../packages/stynx-backend/src/audit/decorators';

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('AuditInterceptor metadata redaction', () => {
  it('applies metadata redaction policy before sink write', async () => {
    const metadata: AuditMetadata = {
      action: 'USER_UPDATED',
      entity: 'auth.user',
      metadataSelector: () => ({
        password: 'secret',
        authorization: 'Bearer token',
        nested: {
          refresh_token: 'abc',
          ok: true,
        },
      }),
    };
    const reflector = {
      getAllAndOverride: jest.fn(() => metadata),
    };
    const sink = {
      write: jest.fn(async (_event: unknown) => undefined),
    };
    const interceptor = new AuditInterceptor(
      reflector as never,
      sink as never,
      new PatternAuditMetadataRedactionPolicy(),
    );

    const request = {
      headers: {},
      ip: '127.0.0.1',
      principal: {
        id: 'user-1',
        roles: ['admin'],
        permissions: [],
        tenants: [],
        claims: {},
      },
    };

    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext(request), next)),
    ).resolves.toEqual({ ok: true });

    expect(sink.write).toHaveBeenCalledTimes(1);
    const firstCall = sink.write.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error('Missing sink write call');
    }
    const payload = firstCall[0] as unknown as { metadata?: Record<string, unknown> };
    expect(payload.metadata).toEqual({
      password: '[REDACTED]',
      authorization: '[REDACTED]',
      nested: {
        refresh_token: '[REDACTED]',
        ok: true,
      },
    });
  });

  it('writes raw metadata when no redaction policy is configured', async () => {
    const metadata: AuditMetadata = {
      action: 'USER_UPDATED',
      metadataSelector: () => ({
        password: 'secret',
      }),
    };
    const reflector = {
      getAllAndOverride: jest.fn(() => metadata),
    };
    const sink = {
      write: jest.fn(async (_event: unknown) => undefined),
    };
    const interceptor = new AuditInterceptor(reflector as never, sink as never);
    const next: CallHandler = {
      handle: () => of('ok'),
    };

    await expect(
      lastValueFrom(interceptor.intercept(createExecutionContext({ headers: {} }), next)),
    ).resolves.toBe('ok');
    const firstCall = sink.write.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error('Missing sink write call');
    }
    const payload = firstCall[0] as unknown as { metadata?: Record<string, unknown> };
    expect(payload.metadata).toEqual({
      password: 'secret',
    });
  });
});
