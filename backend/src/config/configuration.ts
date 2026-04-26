import { registerAs } from '@nestjs/config';

export interface AppConfig {
  name: string;
  env: string;
  port: number;
  version: string;
  corsOrigins: string[];
}

export interface DatabaseConfig {
  url?: string;
  host: string;
  port: number;
  user: string;
  password?: string;
  name: string;
  ssl: boolean;
}

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  jwksUri?: string;
  audience?: string;
  issuer?: string;
}

export interface LoggingConfig {
  level: string;
  pretty: boolean;
}

export interface DocsConfig {
  enabled: boolean;
  path: string;
}

const configuration = () => ({
  app: {
    name: process.env.APP_NAME ?? 'stynx',
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    version: process.env.APP_VERSION ?? '0.1.0',
    corsOrigins: (process.env.CORS_ORIGINS ?? '*')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  } satisfies AppConfig,
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.PGHOST ?? 'localhost',
    port: parseInt(process.env.PGPORT ?? '5432', 10),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD,
    name: process.env.PGDATABASE ?? 'stynx',
    ssl: process.env.PGSSL ? process.env.PGSSL !== 'false' : false,
  } satisfies DatabaseConfig,
  cognito: {
    region: process.env.COGNITO_REGION ?? 'us-east-1',
    userPoolId: process.env.COGNITO_USER_POOL_ID ?? '',
    clientId: process.env.COGNITO_CLIENT_ID ?? '',
    jwksUri: process.env.COGNITO_JWKS_URI,
    audience: process.env.COGNITO_AUDIENCE ?? process.env.COGNITO_CLIENT_ID,
    issuer: process.env.COGNITO_ISSUER,
  } satisfies CognitoConfig,
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
    pretty: process.env.LOG_PRETTY === 'true',
  } satisfies LoggingConfig,
  docs: {
    enabled: process.env.DOCS_ENABLED !== 'false',
    path: process.env.DOCS_PATH ?? '/docs',
  } satisfies DocsConfig,
});

export default configuration;
export const appConfig = registerAs('app', () => configuration().app);
export const databaseConfig = registerAs('database', () => configuration().database);
export const cognitoConfig = registerAs('cognito', () => configuration().cognito);
export const loggingConfig = registerAs('logging', () => configuration().logging);
export const docsConfig = registerAs('docs', () => configuration().docs);
