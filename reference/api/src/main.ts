const startupProtocol = 'stynx-reference-api-startup-v1' as const;
type StartupFailureReason = 'nest-initialization' | 'pre-listen-configuration' | 'listen';

function emitStartupRecord(
  record:
    | {
        protocol: typeof startupProtocol;
        state: 'bootstrap-entered' | 'nest-created' | 'listening';
      }
    | {
        protocol: typeof startupProtocol;
        state: 'bootstrap-failed';
        reason: StartupFailureReason;
      },
): void {
  if (typeof process.send === 'function') {
    try {
      process.send(record);
    } catch {
      // The owning process observes IPC channel failures directly.
    }
  }
}

function resolveCorsOrigins(): string[] {
  return (process.env.STYNX_REFERENCE_WEB_ORIGINS ?? 'http://127.0.0.1:3100,http://localhost:3100')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap(): Promise<void> {
  let failureReason: StartupFailureReason = 'nest-initialization';
  emitStartupRecord({ protocol: startupProtocol, state: 'bootstrap-entered' });
  try {
    await import('reflect-metadata');
    const [{ NestFactory }, { AppModule }, { configureSecurityHeaders }] = await Promise.all([
      import('@nestjs/core'),
      import('./app.module.js'),
      import('./security-headers.js'),
    ]);
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    emitStartupRecord({ protocol: startupProtocol, state: 'nest-created' });

    failureReason = 'pre-listen-configuration';
    configureSecurityHeaders(app);
    app.enableCors({
      origin: resolveCorsOrigins(),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Idempotency-Key',
        'X-Request-Id',
        'X-Tenant-Id',
      ],
      exposedHeaders: ['X-Request-Id', 'X-Stynx-Auth-Verify-Ms'],
    });
    const port = Number(process.env.PORT ?? '3000');

    failureReason = 'listen';
    await app.listen(port);
    emitStartupRecord({ protocol: startupProtocol, state: 'listening' });
    console.log('reference-api startup listening');
  } catch {
    emitStartupRecord({
      protocol: startupProtocol,
      state: 'bootstrap-failed',
      reason: failureReason,
    });
    console.error(`reference-api startup failed: ${failureReason}`);
    process.exitCode = 1;
  }
}

void bootstrap();
