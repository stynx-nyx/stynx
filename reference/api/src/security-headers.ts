import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';

export interface ReferenceApiSecurityHeaderOptions {
  isProduction?: boolean;
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production'
    || process.env.STYNX_ENVIRONMENT === 'production'
    || process.env.STYNX_ENVIRONMENT === 'prod';
}

export function configureSecurityHeaders(
  app: INestApplication,
  options: ReferenceApiSecurityHeaderOptions = {},
): void {
  const isProduction = options.isProduction ?? isProductionEnvironment();

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: {
      action: 'deny',
    },
    hsts: isProduction
      ? {
          maxAge: 31_536_000,
          includeSubDomains: true,
          preload: false,
        }
      : false,
    noSniff: true,
    referrerPolicy: {
      policy: 'no-referrer',
    },
  }));
}
