import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { StynxErrorFilter } from '../../src/error.filter';
import { StynxError } from '../../src/errors';

function makeHost(): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn(function status(this: { json: jest.Mock }) {
    return this;
  });
  const response = { status, json };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('StynxErrorFilter', () => {
  it('forwards plain HttpException with its status + response body', () => {
    const moduleRef = { get: jest.fn() } as unknown as ModuleRef;
    const filter = new StynxErrorFilter(moduleRef);
    const { host, status, json } = makeHost();
    const ex = new BadRequestException({ message: 'bad input' });

    filter.catch(ex, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ message: 'bad input' });
  });

  it('translates StynxError into the standard envelope at exception.status', () => {
    const moduleRef = {
      get: jest.fn(() => undefined),
    } as unknown as ModuleRef;
    const filter = new StynxErrorFilter(moduleRef);
    const { host, status, json } = makeHost();
    const ex = new StynxError('Boom occurred', {
      code: 'BOOM',
      status: 422,
      context: { reason: 'why' },
    });

    filter.catch(ex, host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      code: 'BOOM',
      message: 'Boom occurred',
      context: { reason: 'why' },
    });
  });

  it('omits context from the body when StynxError carries none', () => {
    const moduleRef = { get: jest.fn(() => undefined) } as unknown as ModuleRef;
    const filter = new StynxErrorFilter(moduleRef);
    const { host, json } = makeHost();
    const ex = new StynxError('M', { code: 'C', status: 500 });

    filter.catch(ex, host);

    expect(json).toHaveBeenCalledWith({ code: 'C', message: 'M' });
  });

  it('translates via ErrorTranslator when locale + translator are available', () => {
    const requestContext = {
      hasActiveContext: () => true,
      locale: 'pt-BR',
    };
    const translator = {
      translate: jest.fn(() => 'Mensagem traduzida'),
    };
    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (typeof token === 'function') return requestContext;
        return translator;
      }),
    } as unknown as ModuleRef;
    const filter = new StynxErrorFilter(moduleRef);
    const { host, json } = makeHost();
    const ex = new StynxError('Original', {
      code: 'C',
      status: 400,
      context: { x: 1 },
      messageKey: 'error.boom',
    } as never);

    filter.catch(ex, host);

    expect(translator.translate).toHaveBeenCalledWith('error.boom', 'pt-BR', { x: 1 });
    expect(json).toHaveBeenCalledWith({
      code: 'C',
      message: 'Mensagem traduzida',
      context: { x: 1 },
    });
  });

  it('rethrows when the exception is neither HttpException nor StynxError', () => {
    const moduleRef = { get: jest.fn() } as unknown as ModuleRef;
    const filter = new StynxErrorFilter(moduleRef);
    const { host } = makeHost();
    const ex = new Error('opaque');

    expect(() => filter.catch(ex, host)).toThrow('opaque');
  });

  it('moduleRef resolution gracefully returns undefined when token unknown', () => {
    const moduleRef = {
      get: jest.fn(() => {
        throw new Error('unknown token');
      }),
    } as unknown as ModuleRef;
    const filter = new StynxErrorFilter(moduleRef);
    const { host, status } = makeHost();
    const ex = new StynxError('M', { code: 'C', status: 500 });

    filter.catch(ex, host);
    expect(status).toHaveBeenCalledWith(500);
  });
});
