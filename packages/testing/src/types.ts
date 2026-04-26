import type { DynamicModule, INestApplication, Provider, Type } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { StartedTestContainer } from 'testcontainers';
import type { Client } from 'pg';
import type { Database, Transaction } from '@stynx/data';
import type { RequestContextMutator } from '@stynx/core';
import type { SessionJwtSigningService, StynxSessionSigningKeySet } from '@stynx/sessions';

export type TestSqlStep =
  | string
  | ((client: Client) => Promise<void>);

export interface TestAppOverrides {
  imports?: Array<Type<unknown> | DynamicModule>;
  controllers?: Type<unknown>[];
  providers?: Provider[];
}

export interface CreateTestAppOptions {
  migrations?: TestSqlStep[];
  seeds?: TestSqlStep[];
  overrides?: TestAppOverrides;
  localstack?: {
    enabled?: boolean;
    services?: string[];
  };
  cognito?: {
    enabled?: boolean;
    image?: string;
  };
}

export interface StartedServiceHandle {
  container: StartedTestContainer;
}

export interface StartedPostgresHandle extends StartedServiceHandle {
  connectionString: string;
  adminConnectionString: string;
}

export interface StartedRedisHandle extends StartedServiceHandle {
  url: string;
}

export interface StartedLocalstackHandle extends StartedServiceHandle {
  endpoint: string;
  region: string;
}

export interface StartedCognitoHandle extends StartedServiceHandle {
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
  redis: StartedRedisHandle;
  localstack?: StartedLocalstackHandle;
  cognito?: StartedCognitoHandle;
  adminClient(): Promise<Client>;
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
  perms?: string[];
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
