import { createPinoLogger } from '../../src/pino.factory';

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
});
