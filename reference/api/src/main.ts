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
    // D18 helper-managed listener binding: begin // D17.7 owned listener binding: begin STYNX_REFERENCE_API_OWNED_DIAGNOSTIC
    if (process.env.STYNX_REFERENCE_API_HELPER_MANAGED === '1') {
      await app.listen(port, '127.0.0.1');
    } else {
      await app.listen(port);
    }
    // D18 helper-managed listener binding: end // D17.7 owned listener binding: end
    emitStartupRecord({ protocol: startupProtocol, state: 'listening' });
    // D17.6 runtime route table inspection: begin
    let runtimeRouteTableState:
      | 'runtime-route-table-present'
      | 'runtime-route-table-absent'
      | 'runtime-route-table-indeterminate' = 'runtime-route-table-indeterminate';
    try {
      const governedRuntimeRoutes = [
        'GET /healthz',
        'GET /readyz',
        'GET /_reference/demo-tenants',
      ] as const;
      const httpAdapter: unknown = app.getHttpAdapter();
      const getInstance =
        typeof httpAdapter === 'object' && httpAdapter !== null
          ? Reflect.get(httpAdapter, 'getInstance')
          : undefined;
      const adapterInstance: unknown =
        typeof getInstance === 'function' ? Reflect.apply(getInstance, httpAdapter, []) : undefined;
      const router =
        typeof adapterInstance === 'function' ||
        (typeof adapterInstance === 'object' && adapterInstance !== null)
          ? Reflect.get(adapterInstance, 'router')
          : undefined;
      const stack =
        typeof router === 'function' || (typeof router === 'object' && router !== null)
          ? Reflect.get(router, 'stack')
          : undefined;

      if (Array.isArray(stack)) {
        const routeCounts = new Map(governedRuntimeRoutes.map((route) => [route, 0]));
        let safelyEnumerated = true;
        for (const layer of stack) {
          if (typeof layer !== 'object' || layer === null || Array.isArray(layer)) {
            safelyEnumerated = false;
            break;
          }
          const route: unknown = Reflect.get(layer, 'route');
          if (route === undefined) {
            continue;
          }
          if (typeof route !== 'object' || route === null || Array.isArray(route)) {
            safelyEnumerated = false;
            break;
          }
          const routePath: unknown = Reflect.get(route, 'path');
          const methods: unknown = Reflect.get(route, 'methods');
          const routePaths =
            typeof routePath === 'string'
              ? [routePath]
              : Array.isArray(routePath) && routePath.every((value) => typeof value === 'string')
                ? routePath
                : undefined;
          if (
            !routePaths ||
            typeof methods !== 'object' ||
            methods === null ||
            Array.isArray(methods)
          ) {
            safelyEnumerated = false;
            break;
          }
          const getRegistration: unknown = Reflect.get(methods, 'get');
          if (
            getRegistration !== undefined &&
            getRegistration !== true &&
            getRegistration !== false
          ) {
            safelyEnumerated = false;
            break;
          }
          if (getRegistration === true) {
            for (const path of routePaths) {
              const routeKey = `GET ${path}` as (typeof governedRuntimeRoutes)[number];
              const count = routeCounts.get(routeKey);
              if (count !== undefined) {
                routeCounts.set(routeKey, count + 1);
              }
            }
          }
        }

        if (safelyEnumerated) {
          const counts = governedRuntimeRoutes.map((route) => routeCounts.get(route));
          runtimeRouteTableState = counts.every((count) => count === 1)
            ? 'runtime-route-table-present'
            : counts.every((count) => count === 0)
              ? 'runtime-route-table-absent'
              : 'runtime-route-table-indeterminate';
        }
      }
    } catch {
      runtimeRouteTableState = 'runtime-route-table-indeterminate';
    }
    if (typeof process.send === 'function') {
      try {
        process.send({ protocol: startupProtocol, state: runtimeRouteTableState });
      } catch {
        // The owning process observes IPC channel failures directly.
      }
    }
    // D17.6 runtime route table inspection: end
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
