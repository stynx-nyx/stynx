import 'reflect-metadata';
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import * as backend from '../../src/index';
import { STYNX_AUDIT_METADATA } from '../../src/audit/constants';

type CommandDecorator = (options?: Record<string, unknown>) => MethodDecorator;

describe('transactional command public decorator', () => {
  it('exports one command boundary and a committed response filter', () => {
    const publicApi = backend as unknown as Record<string, unknown>;
    expect(publicApi.TransactionalCommand).toBeTypeOf('function');
    expect(publicApi.StynxTransactionalCommandModule).toBeTypeOf('function');
    expect(publicApi.TransactionalCommandInterceptor).toBeTypeOf('function');
    expect(publicApi.CommittedCommandResponse).toBeTypeOf('function');
    expect(publicApi.CommittedCommandResponseFilter).toBeTypeOf('function');
    expect(publicApi.CommittedCommandError).toBeTypeOf('function');
  });

  it('binds the committed response filter at method scope, ahead of a consumer global catch-all', () => {
    const publicApi = backend as unknown as Record<string, unknown>;
    const transactionalCommand = publicApi.TransactionalCommand as CommandDecorator | undefined;
    expect(transactionalCommand).toBeTypeOf('function');

    class Controller {
      create(): void {}
    }
    transactionalCommand!()(Controller.prototype, 'create', Object.getOwnPropertyDescriptor(Controller.prototype, 'create')!);
    const filters = Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, Controller.prototype.create) as unknown[] | undefined;
    expect(filters).toContain(publicApi.CommittedCommandResponseFilter);
  });

  it('retains the transactional audit marker for the command boundary', () => {
    class Controller {
      create(): void {}
    }
    backend.Audit({ action: 'command.created', entity: 'command', transactional: true } as never)(
      Controller.prototype, 'create', Object.getOwnPropertyDescriptor(Controller.prototype, 'create')!,
    );
    expect(Reflect.getMetadata(STYNX_AUDIT_METADATA, Controller.prototype.create)).toEqual({
      action: 'command.created',
      entity: 'command',
      transactional: true,
    });
  });
});
