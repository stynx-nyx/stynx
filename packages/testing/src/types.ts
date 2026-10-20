import type { DynamicModule, INestApplication, Provider, Type } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { Database, StynxPgClient, Transaction } from '@stynx-nyx/data';
import type { RequestContextMutator } from '@stynx-nyx/core';
import type { TestAppRoleNames } from './roles.js';
import type { SessionJwtSigningService, StynxSessionSigningKeySet } from '@stynx-nyx/sessions';

export type TestSqlStep =
  | string
  | ((client: StynxPgClient) => Promise<void>);

export interface TestAppOverrides {
  imports?: Array<Type<unknown> | DynamicModule>;
  controllers?: Type<unknown>[];
  providers?: Provider[];
}

export interface CreateTestAppOptions {
  /**
   * Product roles the app bootstraps and connects as (S-18): exactly
   * `<prefix>_owner`, `<prefix>_app` and `<prefix>_reader`. Default
   * `DEFAULT_TEST_APP_ROLES`, the STYNX platform roles.
   */
  roles?: TestAppRoleNames;
  migrations?: TestSqlStep[];
  seeds?: TestSqlStep[];
  overrides?: TestAppOverrides;
  /**
   * A Redis the runtime supplies. `@stynx-nyx/testing` starts no service;
   * omitted, the context has no `redis`.
   */
  redis?: {
    url: string;
  };
  /**
   * A LocalStack endpoint the runtime supplies. Omitted (or `enabled: false`),
   * the context has no `localstack`; `enabled: true` without an `endpoint`
   * is refused, since no container is started.
   */
  localstack?: {
    enabled?: boolean;
    endpoint?: string;
    region?: string;
  };
  /**
   * A Cognito-compatible endpoint the runtime supplies, with the same rules
   * as `localstack`. The pool and client default to `local_testing_pool` and
   * `local_testing_client`.
   */
  cognito?: {
    enabled?: boolean;
    endpoint?: string;
    region?: string;
    userPoolId?: string;
    clientId?: string;
  };
}

/**
 * The per-app database `createTestApp` creates on the server `DATABASE_URL`
 * names (and drops on teardown).
 */
export interface StartedPostgresHandle {
  database: string;
  connectionString: string;
  adminConnectionString: string;
}

export interface StartedRedisHandle {
  url: string;
}

export interface StartedLocalstackHandle {
  endpoint: string;
  region: string;
}

export interface StartedCognitoHandle {
  endpoint: string;
  region: string;
  userPoolId: string;
  clientId: string;
}

export interface TestAppContext {
  app: INestApplication;
  moduleRef: TestingModule;
  database: Database;
  requestContextMutator: RequestContextMutator;
  postgres: StartedPostgresHandle;
  redis?: StartedRedisHandle;
  localstack?: StartedLocalstackHandle;
  cognito?: StartedCognitoHandle;
  adminClient(): Promise<StynxPgClient>;
  tx<T>(fn: (trx: Transaction) => Promise<T>): Promise<T>;
  teardown(): Promise<void>;
}

export interface TenantFixture {
  id: string;
  slug: string;
  name: string;
}

export interface UserFixture {
  id: string;
  email: string;
  externalSubject?: string;
  locale?: string;
}

export interface MembershipFixture {
  id: string;
  tenantId: string;
  userId: string;
  isActive?: boolean;
}

export interface DocumentFixture {
  id: string;
  tenantId: string;
  ownerUserId: string;
  collection?: string;
  filename?: string;
  mimeType?: string;
  s3Key?: string;
  checksumSha256?: string;
  byteSize?: number;
}

export interface TestingFixtures {
  createTenant(input?: Partial<TenantFixture>): Promise<TenantFixture>;
  createUser(input?: Partial<UserFixture>): Promise<UserFixture>;
  createMembership(input: Partial<MembershipFixture> & Pick<MembershipFixture, 'tenantId' | 'userId'>): Promise<MembershipFixture>;
  createDocument(input: Partial<DocumentFixture> & Pick<DocumentFixture, 'tenantId' | 'ownerUserId'>): Promise<DocumentFixture>;
}

export interface MintTestSessionInput {
  userId: string;
  tenantId: string;
  /** Permission keys minted into the verified `perms` claim. */
  perms?: string[];
  /** Role keys minted into the verified `roles` claim. */
  roles?: string[];
  sid?: string;
  cognitoSub?: string;
  issuer?: string;
  audience?: string;
  keySet?: StynxSessionSigningKeySet;
}

export interface MintedTestSession {
  token: string;
  sid: string;
  jwks: Awaited<ReturnType<SessionJwtSigningService['getJwks']>>;
}
