import { Controller, Get, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { defer, from, lastValueFrom } from 'rxjs';
import { z } from 'zod';
import { StynxCoreModule } from '../../src/core.module';
import { StynxConfigService } from '../../src/config';
import { RequestContext, RequestContextMutator } from '../../src/request-context';
import { RequestContextInterceptor } from '../../src/request-context.interceptor';
import { SystemContext } from '../../src/system-context';
import { STYNX_SYSTEM_OPERATION_SINK, type SystemOperationRecord, type SystemOperationSink } from '../../src/tokens';

class RecordingSink implements SystemOperationSink {
  readonly records: SystemOperationRecord[] = [];

  async write(record: SystemOperationRecord): Promise<void> {
    this.records.push(record);
  }
}

@Controller()
class TestController {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly systemContext: SystemContext,
    private readonly config: StynxConfigService<{ CORE_TEST_VALUE: string }>,
  ) {}

  @Get('/request-id')
  requestId() {
    return {
      requestId: this.requestContext.requestId,
      configValue: this.config.get('CORE_TEST_VALUE'),
    };
  }

  @Get('/system-op')
  async systemOp() {
    return this.systemContext.withSystemContext('integration test audit', async (context) => ({
      reason: context.reason,
      requestId: context.requestId,
    }));
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

async function invokeRoute<T>(
  interceptor: RequestContextInterceptor,
  headers: Record<string, string | string[] | undefined>,
  handler: () => T | Promise<T>,
): Promise<{ body: T; response: MockResponse }> {
  const { executionContext, response } = createExecutionContext(headers);
  const callHandler: CallHandler = {
    handle: () => defer(() => from(Promise.resolve(handler()))),
  };
  const body = await lastValueFrom(interceptor.intercept(executionContext, callHandler));
  return { body: body as T, response };
}

describe('StynxCoreModule integration', () => {
  const originalValue = process.env.CORE_TEST_VALUE;

  afterEach(() => {
    process.env.CORE_TEST_VALUE = originalValue;
  });

  it('propagates request ids and config values through the module', async () => {
    process.env.CORE_TEST_VALUE = 'from-env';
    const sink = new RecordingSink();
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({
          appName: 'core-tests',
          schema: z.object({
            CORE_TEST_VALUE: z.string(),
          }),
        }),
      ],
      controllers: [TestController],
    })
      .overrideProvider(STYNX_SYSTEM_OPERATION_SINK)
      .useValue(sink)
      .compile();

    const controller = moduleRef.get(TestController);
    const interceptor = new RequestContextInterceptor(moduleRef.get(RequestContextMutator));

    const response = await invokeRoute(
      interceptor,
      {
        'x-request-id': '0197130f-61ce-7d91-89d2-7d427f3257f4',
      },
      () => controller.requestId(),
    );

    expect(response.body.requestId).toBe('0197130f-61ce-7d91-89d2-7d427f3257f4');
    expect(response.response.headers['x-request-id']).toBe(response.body.requestId);
    expect(response.body.configValue).toBe('from-env');

    const systemResponse = await invokeRoute(interceptor, {}, () => controller.systemOp());
    expect(systemResponse.body.reason).toBe('integration test audit');
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.requestId).toBe(systemResponse.body.requestId);
  });

  it('fails fast on invalid configuration during module boot', async () => {
    delete process.env.CORE_TEST_VALUE;

    await expect(
      (async () => {
        const moduleRef = await Test.createTestingModule({
          imports: [
            StynxCoreModule.forRoot({
              appName: 'core-tests',
              schema: z.object({
                CORE_TEST_VALUE: z.string(),
              }),
            }),
          ],
        }).compile();

        moduleRef.get(StynxConfigService);
      })(),
    ).rejects.toThrow('Configuration validation failed');
  });
});
