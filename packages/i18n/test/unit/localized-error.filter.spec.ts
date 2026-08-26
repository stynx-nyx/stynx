import { HttpException } from '@nestjs/common';
import { StynxError } from '@stynx-nyx/core';
import { LocalizedErrorFilter } from '../../src/localized-error.filter';

function host(response: unknown) {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  };
}

describe('LocalizedErrorFilter', () => {
  it('passes non-STYNX HTTP exceptions through unchanged', () => {
    const response = { status: vi.fn(() => response), json: vi.fn() };
    const filter = new LocalizedErrorFilter({ get: vi.fn() } as never);

    filter.catch(new HttpException({ message: 'bad' }, 400), host(response) as never);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ message: 'bad' });
  });

  it('localizes STYNX errors and logs warn/error branches', () => {
    const response = { status: vi.fn(() => response), json: vi.fn() };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        const name = (token as { name?: string }).name;
        if (name === 'RequestContext') {
          return { hasActiveContext: () => true, locale: 'pt-BR' };
        }
        if (name === 'ErrorTranslatorService') {
          return { translate: vi.fn(() => 'traduzido') };
        }
        return undefined;
      }),
    };
    const filter = new LocalizedErrorFilter(moduleRef as never);
    const logger = { warn: vi.fn(), error: vi.fn() };
    Object.defineProperty(filter, 'logger', { value: logger });

    filter.catch(new StynxError('fallback', {
      code: 'TEST_ERROR',
      status: 400,
      messageKey: 'test.error',
      context: { field: 'name' },
    }), host(response) as never);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      code: 'TEST_ERROR',
      message: 'traduzido',
      context: { field: 'name' },
    });
    expect(moduleRef.get).toHaveBeenCalledWith(expect.anything(), { strict: false });
    expect(moduleRef.get.mock.calls.every(([, options]) =>
      JSON.stringify(options) === JSON.stringify({ strict: false })),
    ).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith('traduzido');

    filter.catch(new StynxError('server fallback', {
      code: 'SERVER_ERROR',
      status: 500,
    }), host(response) as never);
    expect(logger.error).toHaveBeenCalledWith('traduzido', expect.any(String));
  });

  it('localizes without an optional request-context provider', () => {
    const response = { status: vi.fn(() => response), json: vi.fn() };
    const translate = vi.fn(() => 'translated without context');
    const moduleRef = {
      get: vi.fn((token: unknown) =>
        (token as { name?: string }).name === 'ErrorTranslatorService' ? { translate } : undefined),
    };
    const filter = new LocalizedErrorFilter(moduleRef as never);
    Object.defineProperty(filter, 'logger', { value: { warn: vi.fn(), error: vi.fn() } });

    filter.catch(new StynxError('fallback text', {
      code: 'NO_REQUEST_CONTEXT',
      status: 400,
      messageKey: 'test.error',
    }), host(response) as never);

    expect(translate).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({
      code: 'NO_REQUEST_CONTEXT',
      message: 'fallback text',
    });
  });

  it('rethrows unknown errors', () => {
    const filter = new LocalizedErrorFilter({ get: vi.fn() } as never);
    const error = new Error('plain');

    expect(() => filter.catch(error, host({ status: vi.fn(), json: vi.fn() }) as never)).toThrow(error);
  });

  it('uses the fallback message and omits context when request context is inactive', () => {
    const response = { status: vi.fn(() => response), json: vi.fn() };
    const translate = vi.fn(() => 'should not be used');
    const moduleRef = {
      get: vi.fn((token: unknown) => (token as { name?: string }).name === 'RequestContext'
        ? { hasActiveContext: () => false, locale: 'pt-BR' }
        : { translate }),
    };
    const filter = new LocalizedErrorFilter(moduleRef as never);
    Object.defineProperty(filter, 'logger', { value: { warn: vi.fn(), error: vi.fn() } });

    filter.catch(new StynxError('fallback text', {
      code: 'INACTIVE_CONTEXT',
      status: 400,
    }), host(response) as never);

    expect(translate).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({
      code: 'INACTIVE_CONTEXT',
      message: 'fallback text',
    });
  });
});
