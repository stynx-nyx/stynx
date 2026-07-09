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
    expect(logger.warn).toHaveBeenCalledWith('traduzido');

    filter.catch(new StynxError('server fallback', {
      code: 'SERVER_ERROR',
      status: 500,
    }), host(response) as never);
    expect(logger.error).toHaveBeenCalledWith('traduzido', expect.any(String));
  });

  it('rethrows unknown errors', () => {
    const filter = new LocalizedErrorFilter({ get: vi.fn() } as never);
    const error = new Error('plain');

    expect(() => filter.catch(error, host({ status: vi.fn(), json: vi.fn() }) as never)).toThrow(error);
  });
});
