import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { StynxSdkError } from '@stynx-nyx/sdk';
import { classifyStynxError } from '../src/error-classification';

describe('classifyStynxError', () => {
  it.each([
    [0, 'network'],
    [400, 'validation'],
    [422, 'validation'],
    [401, 'authentication'],
    [403, 'authorization'],
    [404, 'not-found'],
    [409, 'conflict'],
    [412, 'precondition'],
    [428, 'precondition'],
    [429, 'rate-limit'],
    [500, 'server'],
    [599, 'server'],
    [405, 'unknown'],
    [408, 'unknown'],
    [410, 'unknown'],
    [418, 'unknown'],
    [600, 'unknown'],
  ] as const)('maps HTTP %i to %s', (status, kind) => {
    const result = classifyStynxError(new HttpErrorResponse({ status, error: {} }));
    expect(result).toMatchObject({ status, kind });
  });

  it('maps suffix validation only after the status table, including 418 and 403', () => {
    expect(classifyStynxError(new HttpErrorResponse({
      status: 418,
      error: { errorCode: 'X_VALIDATION_ERROR', message: 'validation' },
    })).kind).toBe('validation');
    expect(classifyStynxError(new HttpErrorResponse({
      status: 403,
      error: { errorCode: 'X_VALIDATION_ERROR', message: 'authorization' },
    })).kind).toBe('authorization');
  });

  it('normalizes both law and legacy bodies and retains their code and safe context', () => {
    const law = classifyStynxError(new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'RESOURCE:CONFLICT:name', message: 'Law message', requestId: 'req-1', details: { field: 'name' } },
    }));
    const legacy = classifyStynxError(new HttpErrorResponse({
      status: 409,
      error: { code: 'LEGACY_CONFLICT', message: 'Legacy message', context: { source: 'old' } },
    }));

    expect(law).toMatchObject({ kind: 'conflict', code: 'RESOURCE:CONFLICT:name', messageKey: 'ui.error.conflict' });
    expect(legacy).toMatchObject({ kind: 'conflict', code: 'LEGACY_CONFLICT', messageKey: 'ui.error.conflict' });
  });

  it('chooses exact code, then the longest colon or underscore prefix, fallback, and kind default', () => {
    const options = {
      messageKeysByCodePrefix: {
        'AUTH:EXPIRED': 'custom.exact',
        AUTH: 'custom.auth',
        'AUTH:UNAUTHENTICATED': 'custom.unauthenticated',
        TENANT: 'custom.tenant',
      },
      fallbackMessageKey: 'custom.fallback',
    };

    expect(classifyStynxError(new HttpErrorResponse({
      status: 401, error: { errorCode: 'AUTH:EXPIRED', message: 'x' },
    }), options).messageKey).toBe('custom.exact');
    expect(classifyStynxError(new HttpErrorResponse({
      status: 401, error: { errorCode: 'AUTH:UNAUTHENTICATED:expired', message: 'x' },
    }), options).messageKey).toBe('custom.unauthenticated');
    expect(classifyStynxError(new HttpErrorResponse({
      status: 401, error: { code: 'AUTH_DENIED', message: 'x' },
    }), options).messageKey).toBe('custom.auth');
    expect(classifyStynxError(new HttpErrorResponse({
      status: 404, error: { code: 'TENANT:NOT_FOUND:item', message: 'x' },
    }), options).messageKey).toBe('custom.tenant');
    expect(classifyStynxError(new HttpErrorResponse({ status: 404, error: {} }), options).messageKey)
      .toBe('custom.fallback');
    expect(classifyStynxError(new HttpErrorResponse({ status: 404, error: {} })).messageKey)
      .toBe('ui.error.not-found');
  });

  it('matches prefixes case-sensitively and only at a segment separator', () => {
    const options = { messageKeysByCodePrefix: { AUTH: 'custom.auth' }, fallbackMessageKey: 'custom.fallback' };
    expect(classifyStynxError(new HttpErrorResponse({ status: 401, error: { code: 'AUTHOR', message: 'x' } }), options).messageKey)
      .toBe('custom.fallback');
    expect(classifyStynxError(new HttpErrorResponse({ status: 401, error: { code: 'auth:expired', message: 'x' } }), options).messageKey)
      .toBe('custom.fallback');
  });

  it('uses the suffix for an SDK error without HTTP status and leaves unknown errors unknown', () => {
    const validation = new StynxSdkError('invalid', undefined as never, 'INPUT_VALIDATION_ERROR');
    expect(classifyStynxError(validation).kind).toBe('validation');
    expect(classifyStynxError(new Error('transport'))).toMatchObject({ kind: 'unknown', messageKey: 'ui.error.unknown' });
    expect(classifyStynxError(new HttpErrorResponse({ status: 0, error: new Error('offline') })).kind).toBe('network');
    expect(classifyStynxError({ status: 0 })).toMatchObject({ kind: 'network', status: 0 });
    expect(classifyStynxError({ status: 503 })).toMatchObject({ kind: 'unknown' });
  });

  it('does not use an untrusted server message as the translation key', () => {
    const result = classifyStynxError(new HttpErrorResponse({
      status: 500,
      error: { message: 'ui.error.authorization', errorCode: 'SERVER:FAILURE:db' },
    }));
    expect(result.messageKey).toBe('ui.error.server');
    expect(result.messageKey).not.toBe('ui.error.authorization');
  });
});
