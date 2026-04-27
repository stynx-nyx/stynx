import { createHash, randomUUID } from 'node:crypto';
import type { StynxPgClient } from '@stynx/data';
import type {
  DocumentFixture,
  MembershipFixture,
  TenantFixture,
  TestingFixtures,
  UserFixture,
} from './types';

function now(): string {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createStynxFixtures(adminClient: () => Promise<StynxPgClient>): TestingFixtures {
  return {
    async createTenant(input = {}): Promise<TenantFixture> {
      const tenant: TenantFixture = {
        id: input.id ?? randomUUID(),
        slug: input.slug ?? `tenant-${randomUUID().slice(0, 8)}`,
        name: input.name ?? 'Testing Tenant',
      };
      const client = await adminClient();
      try {
        await client.query(
          `
            insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
            values ($1::uuid, $2, $3, true, $4::timestamptz, $4::timestamptz)
          `,
          [tenant.id, tenant.slug, tenant.name, now()],
        );
      } finally {
        await client.end();
      }
      return tenant;
    },

    async createUser(input = {}): Promise<UserFixture> {
      const user: UserFixture = {
        id: input.id ?? randomUUID(),
        email: input.email ?? `${randomUUID().slice(0, 8)}@example.com`,
        ...(input.externalSubject !== undefined ? { externalSubject: input.externalSubject } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
      };
      const client = await adminClient();
      try {
        await client.query(
          `
            insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
            values ($1::uuid, $2, $3, $4, $5::timestamptz, $5::timestamptz)
          `,
          [
            user.id,
            user.email,
            user.externalSubject ?? user.id,
            user.locale ?? 'pt-BR',
            now(),
          ],
        );
      } finally {
        await client.end();
      }
      return user;
    },

    async createMembership(input): Promise<MembershipFixture> {
      const membership: MembershipFixture = {
        id: input.id ?? randomUUID(),
        tenantId: input.tenantId,
        userId: input.userId,
        isActive: input.isActive ?? true,
      };
      const client = await adminClient();
      try {
        await client.query(
          `
            insert into auth.memberships (
              id,
              tenant_id,
              user_id,
              effective_hash,
              effective_hash_generation,
              is_active,
              created_at
            )
            values ($1::uuid, $2::uuid, $3::uuid, null, 0, $4, $5::timestamptz)
          `,
          [membership.id, membership.tenantId, membership.userId, membership.isActive, now()],
        );
      } finally {
        await client.end();
      }
      return membership;
    },

    async createDocument(input): Promise<DocumentFixture> {
      const stamp = now();
      const document: DocumentFixture = {
        id: input.id ?? randomUUID(),
        tenantId: input.tenantId,
        ownerUserId: input.ownerUserId,
        collection: input.collection ?? 'invoices',
        filename: input.filename ?? 'invoice.pdf',
        mimeType: input.mimeType ?? 'application/pdf',
        s3Key: input.s3Key ?? `testing/${randomUUID()}.pdf`,
        checksumSha256: input.checksumSha256 ?? sha256(`doc:${input.ownerUserId}:${stamp}`),
        byteSize: input.byteSize ?? 128,
      };
      const client = await adminClient();
      try {
        await client.query(
          `
            insert into storage.documents (
              id,
              tenant_id,
              collection,
              s3_key,
              filename,
              mime_type,
              byte_size,
              checksum_sha256,
              scan_status,
              scan_detail,
              encryption,
              classification,
              owner_user_id,
              created_at,
              updated_at
            )
            values (
              $1::uuid,
              $2::uuid,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              'completed',
              '{}'::jsonb,
              'aws:kms',
              'internal',
              $9::uuid,
              $10::timestamptz,
              $10::timestamptz
            )
          `,
          [
            document.id,
            document.tenantId,
            document.collection,
            document.s3Key,
            document.filename,
            document.mimeType,
            document.byteSize,
            document.checksumSha256,
            document.ownerUserId,
            stamp,
          ],
        );
      } finally {
        await client.end();
      }
      return document;
    },
  };
}
