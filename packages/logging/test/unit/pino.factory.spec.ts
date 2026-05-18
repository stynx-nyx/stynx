import { RequestLogFieldFactory, createPinoLogger, resolveRedactPaths } from '../../src/pino.factory';

describe('createPinoLogger', () => {
  it('redacts sensitive values', () => {
    let output = '';
    const logger = createPinoLogger({
      destination: {
        write(chunk: string) {
          output += chunk;
          return true;
        },
      } as never,
    });

    logger.info({ password: 'secret-value' }, 'test');

    expect(output).toContain('"password":"[Redacted]"');
    expect(output).not.toContain('secret-value');
  });

  it('refuses an empty redact list in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      expect(() =>
        createPinoLogger({
          redactPaths: [],
          additionalRedactPaths: [],
        }),
      ).toThrow('Production logging requires at least one redact path');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('deduplicates and filters redact paths while honoring explicit level', () => {
    expect(resolveRedactPaths({
      redactPaths: ['password', ' ', 'token'],
      additionalRedactPaths: ['token', 'session.secret'],
    })).toEqual(['password', 'token', 'session.secret']);

    let output = '';
    const logger = createPinoLogger({
      level: 'debug',
      redactPaths: ['secret'],
      destination: {
        write(chunk: string) {
          output += chunk;
          return true;
        },
      } as never,
    });

    logger.debug({ secret: 'hidden' }, 'debuggable');
    expect(output).toContain('"level":20');
    expect(output).toContain('"secret":"[Redacted]"');
  });

  it('uses default redact paths and LOG_LEVEL defaults', () => {
    const originalLogLevel = process.env.LOG_LEVEL;
    const originalNodeEnv = process.env.NODE_ENV;
    let output = '';

    try {
      process.env.LOG_LEVEL = 'warn';
      delete process.env.NODE_ENV;
      expect(resolveRedactPaths()).toEqual(expect.arrayContaining(['password', 'token']));

      const envLogger = createPinoLogger({
        destination: {
          write(chunk: string) {
            output += chunk;
            return true;
          },
        } as never,
      });
      expect(envLogger.level).toBe('warn');
      envLogger.warn('warn by default');
      expect(output).toContain('"level":40');
    } finally {
      process.env.LOG_LEVEL = originalLogLevel;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('uses stdout destination defaults in production when no destination is injected', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalLogLevel = process.env.LOG_LEVEL;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.LOG_LEVEL;

      const logger = createPinoLogger();

      expect(logger.level).toBe('info');
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.LOG_LEVEL = originalLogLevel;
    }
  });

  it('uses the development pretty transport when no destination is injected outside production', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalLogLevel = process.env.LOG_LEVEL;

    try {
      delete process.env.NODE_ENV;
      delete process.env.LOG_LEVEL;

      const logger = createPinoLogger();

      expect(logger.level).toBe('info');
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.LOG_LEVEL = originalLogLevel;
    }
  });
});

describe('RequestLogFieldFactory', () => {
  it('returns only extra fields when no request context is active', () => {
    const factory = new RequestLogFieldFactory({
      hasActiveContext: () => false,
    } as never);

    expect(factory.create({ route: '/demo' })).toEqual({ route: '/demo' });
    expect(factory.create()).toEqual({});
  });

  it('projects active request context fields', () => {
    const factory = new RequestLogFieldFactory({
      hasActiveContext: () => true,
      requestId: 'req-1',
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      sessionId: 'session-1',
      locale: 'pt-BR',
    } as never);

    expect(factory.create({ route: '/demo' })).toMatchObject({
      request_id: 'req-1',
      tenant_id: 'tenant-1',
      actor_id: 'actor-1',
      session_id: 'session-1',
      locale: 'pt-BR',
      route: '/demo',
    });
  });

  it('omits optional request context fields when they are unset', () => {
    const factory = new RequestLogFieldFactory({
      hasActiveContext: () => true,
      requestId: 'req-2',
    } as never);

    expect(factory.create()).toEqual({ request_id: 'req-2' });
  });
});
