import { Controller, Get, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequestContext, RequestContextMutator, RequestContextInterceptor, StynxCoreModule } from '@stynx-nyx/core';
import { defer, from, lastValueFrom } from 'rxjs';
import { z } from 'zod';
import { StynxLogger } from '../../src/logger.service';
import { StynxLoggingModule } from '../../src/logging.module';

@Controller()
class LoggingController {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly logger: StynxLogger,
  ) {}

  @Get('/logs')
  endpoint() {
    this.logger.log('logged inside request', { route: '/logs', method: 'GET' });
    return {
      requestId: this.requestContext.requestId,
    };
  }
}

interface MockResponse {
  headers: Record<string, string>;
  setHeader(name: string, value: string): void;
}

function createExecutionContext(headers: Record<string, string | string[] | undefined>): {
  executionContext: ExecutionContext;
  response: MockResponse;
} {
  const response: MockResponse = {
    headers: {},
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
  };

  const executionContext = {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => response,
    }),
  } as ExecutionContext;

  return { executionContext, response };
}

describe('StynxLoggingModule integration', () => {
  it('emits JSON logs with the active request id', async () => {
    process.env.LOG_CORE_VALUE = 'ready';
    let output = '';
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({
          appName: 'logging-tests',
          schema: z.object({
            LOG_CORE_VALUE: z.string(),
          }),
        }),
        StynxLoggingModule.forRoot({
          destination: {
            write(chunk: string) {
              output += chunk;
              return true;
            },
          } as never,
        }),
      ],
      controllers: [LoggingController],
    }).compile();

    const interceptor = new RequestContextInterceptor(moduleRef.get(RequestContextMutator));
    const controller = moduleRef.get(LoggingController);
    const { executionContext, response } = createExecutionContext({
      'x-request-id': '0197130f-61ce-7d91-89d2-7d427f3257f4',
    });
    const callHandler: CallHandler = {
      handle: () => defer(() => from(Promise.resolve(controller.endpoint()))),
    };

    const body = await lastValueFrom(interceptor.intercept(executionContext, callHandler));
    const parsedLine = JSON.parse(output.trim().split('\n')[0] ?? '{}');

    expect(body).toEqual({
      requestId: '0197130f-61ce-7d91-89d2-7d427f3257f4',
    });
    expect(response.headers['x-request-id']).toBe('0197130f-61ce-7d91-89d2-7d427f3257f4');
    expect(parsedLine.request_id).toBe('0197130f-61ce-7d91-89d2-7d427f3257f4');
    expect(parsedLine.msg).toBe('logged inside request');
  });
});
