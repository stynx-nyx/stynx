# Full Feature Walkthrough — Invoice Management

&gt; Companion to [`04-INVARIANTS-AND-CONTRACTS.md`](../04-INVARIANTS-AND-CONTRACTS.md),
&gt; [`06-DATA-LAYER-PATTERNS.md`](../06-DATA-LAYER-PATTERNS.md),
&gt; [`07-AUTH-AND-TENANCY-PATTERNS.md`](../07-AUTH-AND-TENANCY-PATTERNS.md),
&gt; [`08-MIGRATION-PATTERNS.md`](../08-MIGRATION-PATTERNS.md),
&gt; [`09-FRONTEND-PATTERNS.md`](../09-FRONTEND-PATTERNS.md),
&gt; and the spec excerpt set starting at [`16-SPEC-EXCERPTS/invariants.md`](../16-SPEC-EXCERPTS/invariants.md).

This walkthrough ports a complete invoice-management feature:

- multi-tenant invoice CRUD,
- soft-delete + restore,
- audit labels and trigger-backed row audit,
- PDF/image attachments through STYNX storage,
- LGPD-aware PII mapping,
- one cascade FK,
- one block FK,
- one hide FK,
- one non-nullify PII strategy,
- one read-only route,
- one idempotent route,
- a focused local test set.

---

## Before — legacy invoice feature

```typescript
// FOREIGN — condensed legacy feature before port
import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Request } from 'express';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function migrateLegacyInvoices() {
  await pool.query(`
    create table if not exists invoices (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null, number text not null,
      customer_name text not null, customer_email text not null,
      customer_tax_id text not null, status text not null default 'draft',
      total_cents bigint not null default 0, deleted boolean not null default false,
      deleted_at timestamptz null, created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, number)
    );
    create table if not exists invoice_lines (
      id uuid primary key default gen_random_uuid(),
      invoice_id uuid not null references invoices(id) on delete cascade,
      organization_id uuid not null, description text not null, amount_cents bigint not null
    );
    create table if not exists invoice_payments (
      id uuid primary key default gen_random_uuid(),
      invoice_id uuid not null references invoices(id) on delete cascade,
      organization_id uuid not null, provider_ref text not null, paid_cents bigint not null
    );
    create table if not exists invoice_files (
      id uuid primary key default gen_random_uuid(),
      invoice_id uuid not null references invoices(id) on delete cascade,
      organization_id uuid not null, s3_key text not null, filename text not null
    );
  `);
}

function legacyTenant(req: Request) {
  return String(req.headers['x-organization-id'] ?? '');
}

function legacyActor(req: Request) {
  return String(req.headers['x-user-id'] ?? '');
}

@Controller('/api/invoices')
export class LegacyInvoicesController {
  @Get()
  async list(@Req() req: Request) {
    const orgId = legacyTenant(req);
    const rows = await pool.query(
      'select * from invoices where organization_id = $1 and deleted = false order by updated_at desc',
      [orgId],
    );
    return rows.rows;
  }

  @Post()
  async create(@Req() req: Request, @Body() body: any) {
    const orgId = legacyTenant(req);
    const actor = legacyActor(req);
    const inserted = await pool.query(
      `insert into invoices (organization_id, number, customer_name, customer_email, customer_tax_id, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [orgId, body.number, body.customerName, body.customerEmail, body.customerTaxId, actor],
    );
    return inserted.rows[0];
  }

  @Post('/:id/file')
  async upload(@Req() req: Request, @Param('id') id: string, @Body() file: any) {
    const orgId = legacyTenant(req);
    const key = `${orgId}/invoices/${id}/${file.filename}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.BUCKET, Key: key, Body: file.bytes }));
    await pool.query(
      'insert into invoice_files (invoice_id, organization_id, s3_key, filename) values ($1,$2,$3,$4)',
      [id, orgId, key, file.filename],
    );
    return { key };
  }

  @Delete('/:id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const orgId = legacyTenant(req);
    await pool.query(
      'update invoices set deleted = true, deleted_at = now() where id = $1 and organization_id = $2',
      [id, orgId],
    );
    return { status: 'deleted', id };
  }
}
```

### Why this feature needs a real port

The legacy version violates I1 with raw `pg.Pool`, I3 with direct S3 access,
I4 with unguarded routes, I5 with `organization_id` and no RLS, I6 with no
audit trigger path, and I8 with live-table deletion flags. It also lets
payments cascade-delete at the database level, which erases compliance
evidence. The STYNX version below makes every behavior explicit.

---

## After — migration

```sql
-- apps/billing-api/migrations/0001_billing_invoices.sql
BEGIN;

CREATE SCHEMA IF NOT EXISTS billing AUTHORIZATION stynx_owner;
GRANT USAGE ON SCHEMA billing TO stynx_app, stynx_reader;

ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA billing
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stynx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA billing
  GRANT SELECT ON TABLES TO stynx_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA billing
  GRANT USAGE, SELECT ON SEQUENCES TO stynx_app, stynx_reader;

-- Aggregate root.
SELECT data.create_soft_deletable_table($$
  CREATE TABLE billing.invoice (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid        NOT NULL REFERENCES tenancy.tenants(id),

    number           text        NOT NULL,
    customer_name    text        NOT NULL,
    customer_email   citext      NOT NULL,
    customer_tax_id  text        NOT NULL,
    status           text        NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','issued','paid','void')),
    total_cents      bigint      NOT NULL DEFAULT 0 CHECK (total_cents >= 0),

    approved_by_user_id uuid NULL
      REFERENCES auth.users(id) ON DELETE SET NULL,
    -- @softdelete_fk: hide
    -- User archival must not archive invoices; the attribution becomes hidden.

    created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by       uuid        NOT NULL,
    updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by       uuid        NOT NULL,

    UNIQUE (tenant_id, number)
  );
$$);

-- Cascade child: line items have no independent lifecycle.
SELECT data.create_soft_deletable_table($$
  CREATE TABLE billing.invoice_line (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES tenancy.tenants(id),

    invoice_id      uuid        NOT NULL REFERENCES billing.invoice(id) ON DELETE RESTRICT,
    -- @softdelete_fk: cascade

    line_no         integer     NOT NULL CHECK (line_no > 0),
    description     text        NOT NULL,
    quantity        numeric(12,3) NOT NULL CHECK (quantity > 0),
    unit_cents      bigint      NOT NULL CHECK (unit_cents >= 0),
    total_cents     bigint      NOT NULL CHECK (total_cents >= 0),

    created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by      uuid        NOT NULL,

    UNIQUE (tenant_id, invoice_id, line_no)
  );
$$);

-- Block child: payments have independent evidence lifecycle.
SELECT data.create_soft_deletable_table($$
  CREATE TABLE billing.invoice_payment (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES tenancy.tenants(id),

    invoice_id      uuid        NOT NULL REFERENCES billing.invoice(id) ON DELETE RESTRICT,
    -- @softdelete_fk: block

    provider_ref    text        NOT NULL,
    paid_cents      bigint      NOT NULL CHECK (paid_cents > 0),
    paid_at         timestamptz NOT NULL,

    created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by      uuid        NOT NULL,

    UNIQUE (tenant_id, provider_ref)
  );
$$);

-- Attachment registry: links STYNX storage documents to the invoice.
SELECT data.create_soft_deletable_table($$
  CREATE TABLE billing.invoice_attachment (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES tenancy.tenants(id),

    invoice_id      uuid        NOT NULL REFERENCES billing.invoice(id) ON DELETE RESTRICT,
    -- @softdelete_fk: cascade

    document_id     uuid        NOT NULL,
    filename        text        NOT NULL,
    mime_type       text        NOT NULL,

    created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by      uuid        NOT NULL
  );
$$);

SELECT data.register_softdelete_fk('auth','users','billing','invoice',
                                   'invoice_approved_by_user_id_fkey','hide');
SELECT data.register_softdelete_fk('billing','invoice','billing','invoice_line',
                                   'invoice_line_invoice_id_fkey','cascade');
SELECT data.register_softdelete_fk('billing','invoice','billing','invoice_payment',
                                   'invoice_payment_invoice_id_fkey','block');
SELECT data.register_softdelete_fk('billing','invoice','billing','invoice_attachment',
                                   'invoice_attachment_invoice_id_fkey','cascade');

CREATE INDEX idx_invoice_tenant_status
  ON billing.invoice (tenant_id, status, updated_at DESC);
CREATE INDEX idx_invoice_line_invoice
  ON billing.invoice_line (invoice_id);
CREATE INDEX idx_invoice_payment_invoice
  ON billing.invoice_payment (invoice_id);
CREATE INDEX idx_invoice_attachment_invoice
  ON billing.invoice_attachment (invoice_id);

INSERT INTO auth.perms (key, description) VALUES
  ('billing:invoice:read', 'Read invoices in the tenant.'),
  ('billing:invoice:write', 'Create and update invoices.'),
  ('billing:invoice:issue', 'Issue an invoice.'),
  ('billing:invoice:delete', 'Soft-delete invoices.'),
  ('billing:invoice:restore', 'Restore soft-deleted invoices.'),
  ('billing:invoice:attachment:write', 'Create invoice attachment uploads.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO core.pii_map (table_schema, table_name, column_name, category, strategy, notes)
VALUES
  ('billing', 'invoice', 'customer_name',   'direct_pii', 'tombstone',
    'Required by fiscal display shape; replace with a tombstone instead of NULL.'),
  ('billing', 'invoice', 'customer_email',  'direct_pii', 'hash_with_salt',
    'Non-nullify strategy: preserve dedupe while erasing readability.'),
  ('billing', 'invoice', 'customer_tax_id', 'direct_pii', 'hash_with_salt',
    'Tax identifier must not remain readable after LGPD erasure.'),
  ('billing', 'invoice_line', 'description', 'incidental_pii', 'nullify',
    'Free text may contain personal data.')
ON CONFLICT (table_schema, table_name, column_name) DO UPDATE
  SET category = EXCLUDED.category,
      strategy = EXCLUDED.strategy,
      notes    = EXCLUDED.notes;

COMMIT;
```

`[GAP — `billing.invoice_attachment.document_id`is intentionally not declared
as an FK in this example because`storage.documents`is platform-owned; verify
whether the final app wants a real FK and which`@softdelete_fk` behavior the
storage table supports before adding it.]`

## After — service

```typescript
// src/billing/invoice.service.ts
import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import { DocumentsService } from '@stynx-nyx/storage';
import { and, desc, eq } from 'drizzle-orm';
import { invoiceAttachments, invoiceLines, invoicePayments, invoices } from './schema';
import type { CreateInvoiceDto, CreateLineDto, IssueInvoiceDto, ListInvoiceQuery } from './types';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly database: Database,
    private readonly requestContext: RequestContext,
    private readonly documents: DocumentsService,
  ) {}

  list(query: ListInvoiceQuery = {}) {
    return this.database.tx(
      (trx) =>
        trx
          .select()
          .from(invoices)
          .orderBy(desc(invoices.updatedAt))
          .limit(Math.min(query.limit ?? 50, 200)),
      { role: 'reader', readonly: true },
    );
  }

  async get(id: string) {
    return this.requireInvoice(id);
  }

  async create(input: CreateInvoiceDto) {
    return this.database.tx(async (trx) => {
      const id = randomUUID();
      const now = new Date();
      await trx.insert(invoices).values({
        id,
        tenantId: this.tenantId(),
        number: input.number,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerTaxId: input.customerTaxId,
        status: 'draft',
        totalCents: input.lines.reduce((sum, line) => sum + line.totalCents, 0),
        approvedByUserId: null,
        createdAt: now,
        createdBy: this.actorId(),
        updatedAt: now,
        updatedBy: this.actorId(),
      });
      await this.insertLines(trx, id, input.lines, now);
      return this.requireInvoice(id);
    });
  }

  async issue(id: string, input: IssueInvoiceDto) {
    return this.database.tx(async (trx) => {
      await this.requireInvoice(id);
      await trx
        .update(invoices)
        .set({
          status: 'issued',
          approvedByUserId: input.approvedByUserId ?? this.actorId(),
          updatedAt: new Date(),
          updatedBy: this.actorId(),
        })
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, this.tenantId())));
      return this.requireInvoice(id);
    });
  }

  async addPayment(id: string, input: { providerRef: string; paidCents: number; paidAt: string }) {
    return this.database.tx(async (trx) => {
      await this.requireInvoice(id);
      await trx.insert(invoicePayments).values({
        id: randomUUID(),
        tenantId: this.tenantId(),
        invoiceId: id,
        providerRef: input.providerRef,
        paidCents: input.paidCents,
        paidAt: new Date(input.paidAt),
        createdAt: new Date(),
        createdBy: this.actorId(),
        updatedAt: new Date(),
        updatedBy: this.actorId(),
      });
      return this.requireInvoice(id);
    });
  }

  async initiateAttachment(
    id: string,
    file: { filename: string; mimeType: string; byteSize: number; checksumSha256: string },
  ) {
    await this.requireInvoice(id);
    return this.documents.initiate({
      collection: 'invoice-attachments',
      filename: file.filename,
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      checksumSha256: file.checksumSha256,
      classification: 'confidential',
    });
  }

  async completeAttachment(
    invoiceId: string,
    documentId: string,
    file: { filename: string; mimeType: string },
  ) {
    const completed = await this.documents.complete(documentId);
    await this.database.tx(async (trx) => {
      await trx.insert(invoiceAttachments).values({
        id: randomUUID(),
        tenantId: this.tenantId(),
        invoiceId,
        documentId,
        filename: file.filename,
        mimeType: file.mimeType,
        createdAt: new Date(),
        createdBy: this.actorId(),
        updatedAt: new Date(),
        updatedBy: this.actorId(),
      });
    });
    return completed;
  }

  async softDelete(id: string) {
    return this.database.tx(async (trx) => {
      await this.requireInvoice(id);
      const result = await trx.softDelete(invoices, id);
      return { ...result, archiveId: result.archiveId.toString() };
    });
  }

  async restore(id: string) {
    return this.database.tx(async (trx) => {
      await trx.restoreWithCascade(invoices, id);
      return this.requireInvoice(id);
    });
  }

  private async insertLines(
    trx: Transaction,
    invoiceId: string,
    lines: CreateLineDto[],
    now: Date,
  ) {
    for (const [index, line] of lines.entries()) {
      await trx.insert(invoiceLines).values({
        id: randomUUID(),
        tenantId: this.tenantId(),
        invoiceId,
        lineNo: index + 1,
        description: line.description,
        quantity: line.quantity,
        unitCents: line.unitCents,
        totalCents: line.totalCents,
        createdAt: now,
        createdBy: this.actorId(),
        updatedAt: now,
        updatedBy: this.actorId(),
      });
    }
  }

  private async requireInvoice(id: string) {
    const rows = await this.database.tx(
      (trx) =>
        trx
          .select()
          .from(invoices)
          .where(and(eq(invoices.id, id), eq(invoices.tenantId, this.tenantId())))
          .limit(1),
      { role: 'reader', readonly: true },
    );
    if (!rows[0]) throw new NotFoundException('INVOICE_NOT_FOUND');
    return rows[0];
  }

  private tenantId() {
    const value = this.requestContext.tenantId;
    if (!value) throw new NotFoundException('TENANT_CONTEXT_MISSING');
    return value;
  }

  private actorId() {
    const value = this.requestContext.actorId;
    if (!value) throw new NotFoundException('ACTOR_CONTEXT_MISSING');
    return value;
  }
}
```

`[GAP — the DTOs in this example are local to the consuming app; STYNX ships
the transaction, storage, auth, and frontend infrastructure, not
domain-specific billing DTO definitions.]`

---

## After — controller and module wiring

```typescript
// src/billing/invoice.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  Permission,
  PermissionGuard,
  ReadOnly,
  StynxAuthGuard,
  StynxAuthModule,
} from '@stynx-nyx/auth';
import { StynxDataModule } from '@stynx-nyx/data';
import { StynxStorageModule } from '@stynx-nyx/storage';
import { StynxTenancyModule } from '@stynx-nyx/tenancy';
import { Audit, StynxPlatformPipelineModule } from '@stynx-nyx/backend';
import { Idempotent } from '@stynx-nyx/idempotency';
import { RateLimit } from '@stynx-nyx/ratelimit';
import { InvoiceService } from './invoice.service';
import type { CreateInvoiceDto, IssueInvoiceDto, ListInvoiceQuery } from './types';

@Controller('/invoices')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  @ReadOnly()
  @Permission('billing:invoice:read')
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.list' })
  @Audit({ action: 'billing.invoice.list', entity: 'billing.invoice' })
  list(@Query() query: ListInvoiceQuery) {
    return this.invoices.list(query);
  }

  @Get('/:id')
  @ReadOnly()
  @Permission('billing:invoice:read')
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.get' })
  @Audit({ action: 'billing.invoice.get', entity: 'billing.invoice' })
  get(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Post()
  @Permission('billing:invoice:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.create', cost: 3 })
  @Audit({ action: 'billing.invoice.create', entity: 'billing.invoice' })
  create(@Body() input: CreateInvoiceDto) {
    return this.invoices.create(input);
  }

  @Post('/:id/issue')
  @Permission('billing:invoice:issue')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.issue', cost: 2 })
  @Audit({ action: 'billing.invoice.issue', entity: 'billing.invoice' })
  issue(@Param('id') id: string, @Body() input: IssueInvoiceDto) {
    return this.invoices.issue(id, input);
  }

  @Post('/:id/attachments')
  @Permission('billing:invoice:attachment:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.attachments.create', cost: 2 })
  @Audit({ action: 'billing.invoice.attachment.initiate', entity: 'billing.invoice_attachment' })
  initiateAttachment(
    @Param('id') id: string,
    @Body() input: { filename: string; mimeType: string; byteSize: number; checksumSha256: string },
  ) {
    return this.invoices.initiateAttachment(id, input);
  }

  @Delete('/:id')
  @Permission('billing:invoice:delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.delete', cost: 4 })
  @Audit({ action: 'billing.invoice.soft-delete', entity: 'billing.invoice' })
  remove(@Param('id') id: string) {
    return this.invoices.softDelete(id);
  }
}

@Module({
  imports: [
    StynxDataModule.forRoot({
      connections: {
        owner: {
          connectionString:
            process.env.STYNX_OWNER_DATABASE_URL ??
            'postgresql://postgres:postgres@localhost:5432/postgres',
        },
        app: {
          connectionString:
            process.env.STYNX_APP_DATABASE_URL ??
            'postgresql://postgres:postgres@localhost:5432/postgres',
        },
        reader: {
          connectionString:
            process.env.STYNX_READER_DATABASE_URL ??
            'postgresql://postgres:postgres@localhost:5432/postgres',
        },
      },
    }),
    StynxTenancyModule.forRoot({}),
    StynxAuthModule.forRoot({
      stynx: { issuer: process.env.STYNX_STYNX_ISSUER ?? 'https://stynx.local' },
      cognito: { issuer: process.env.STYNX_COGNITO_ISSUER ?? 'https://cognito.local' },
    }),
    StynxStorageModule.forRoot({
      environment: process.env.STYNX_ENVIRONMENT ?? 'local',
      region: process.env.STYNX_STORAGE_REGION ?? 'us-east-1',
      kmsAlias: process.env.STYNX_KMS_ALIAS ?? 'stynx-local',
      collections: {
        'invoice-attachments': {
          mimeAllowlist: ['application/pdf', 'image/png'],
          maxBytes: 15 * 1024 * 1024,
          classificationDefault: 'confidential',
        },
      },
    }),
    StynxPlatformPipelineModule.forRoot({
      rateLimit: { defaultLimit: 120, defaultWindowSeconds: 60 },
      idempotency: { ttlMs: 24 * 60 * 60 * 1000 },
    }),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, StynxAuthGuard, PermissionGuard],
})
export class BillingModule {}
```

---

## After — Angular page

```typescript
// src/app/invoices.page.ts
import { CommonModule, NgFor } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { StynxSessionService, StynxHasPermissionDirective } from '@stynx-web/angular-auth';
import {
  TenantContextService,
  TenantSwitcherComponent,
  type TenantOption,
} from '@stynx-web/angular-tenancy';
import { StynxDocumentUploadComponent } from '@stynx-web/angular-storage';
import { StynxSdkClient } from '@stynx-web/sdk';
import { environment } from '../environments/environment';

interface InvoiceRow {
  id: string;
  number: string;
  customerName: string;
  totalCents: number;
  status: 'draft' | 'issued' | 'paid' | 'void';
}

@Component({
  standalone: true,
  selector: 'billing-invoices-page',
  imports: [
    CommonModule,
    NgFor,
    TenantSwitcherComponent,
    StynxHasPermissionDirective,
    StynxDocumentUploadComponent,
  ],
  template: `
    <stynx-tenant-switcher
      [tenants]="tenants"
      (tenantChange)="switchTenant($event)"
    ></stynx-tenant-switcher>
    <button type="button" (click)="load()">Reload</button>
    <table>
      <tr *ngFor="let invoice of invoices()">
        <td>{{ invoice.number }}</td>
        <td>{{ invoice.customerName }}</td>
        <td>{{ invoice.status }}</td>
        <td>
          <button
            type="button"
            *stynxHasPermission="'billing:invoice:issue'"
            (click)="issue(invoice.id)"
          >
            Issue
          </button>
          <stynx-document-upload
            collection="invoice-attachments"
            [allowedMimes]="['application/pdf', 'image/png']"
            [maxBytes]="15 * 1024 * 1024"
            (completed)="load()"
          >
          </stynx-document-upload>
        </td>
      </tr>
    </table>
  `,
})
export class InvoicesPage {
  private readonly session = inject(StynxSessionService);
  private readonly tenancy = inject(TenantContextService);
  private readonly sdk = new StynxSdkClient({
    baseUrl: environment.apiBaseUrl,
    fetchFn: fetch,
    authProvider: this.session,
    tenantProvider: { getTenantId: () => this.tenancy.tenantId() },
  });
  readonly tenants: TenantOption[] = [
    { id: '01978f4a-32bf-7c27-a131-fd73a9e001a1', label: 'Demo tenant' },
    { id: '01978f4a-32bf-7c27-a131-fd73a9e001a2', label: 'Ops tenant' },
  ];
  readonly invoices = signal<InvoiceRow[]>([]);

  async load() {
    this.invoices.set(await this.sdk.get<InvoiceRow[]>('/invoices'));
  }

  async issue(id: string) {
    await this.sdk.post(
      `/invoices/${id}/issue`,
      {},
      {
        headers: { 'Idempotency-Key': `invoice-issue-${id}-${crypto.randomUUID()}` },
      },
    );
    await this.load();
  }

  async switchTenant(tenantId: string) {
    await this.session.switchTenant(tenantId);
    await this.load();
  }
}
```

---

## After — focused tests

```typescript
// test/billing/invoice.service.spec.ts
import { describe, expect, it } from 'vitest';
import { SoftDeleteBlockedError } from '@stynx-nyx/data';
import { createTestApp, expectRLSIsolated, withTenant } from '@stynx-nyx/testing';
import { InvoiceController } from '../../src/billing/invoice.controller';
import { InvoiceService } from '../../src/billing/invoice.service';
import invoiceMigrationSql from '../../src/billing/migrations/0001_billing_invoices.sql?raw';

describe('billing invoices', () => {
  it('isolates tenant reads and uses the reader role for read-only paths', async () => {
    const app = await createTestApp({
      migrations: [invoiceMigrationSql],
      overrides: {
        controllers: [InvoiceController],
        providers: [InvoiceService],
      },
    });
    try {
      const service = app.moduleRef.get(InvoiceService);
      const tenantA = '00000000-0000-0000-0000-0000000000a1';
      const tenantB = '00000000-0000-0000-0000-0000000000b1';

      await withTenant(app.requestContextMutator, tenantA, async () => {
        await service.create({
          number: 'A-001',
          customerName: 'Tenant A',
          customerEmail: 'a@example.test',
          customerTaxId: '111',
          lines: [{ description: 'Line', quantity: 1, unitCents: 100, totalCents: 100 }],
        });
      });

      await expectRLSIsolated(
        (tenantId) => withTenant(app.requestContextMutator, tenantId, () => service.list()),
        { tenantA, tenantB },
      );
    } finally {
      await app.teardown();
    }
  });

  it('blocks invoice soft-delete when live payments exist', async () => {
    const app = await createTestApp({ migrations: [invoiceMigrationSql] });
    try {
      const service = app.moduleRef.get(InvoiceService);
      const tenantId = '00000000-0000-0000-0000-0000000000c1';
      await withTenant(app.requestContextMutator, tenantId, async () => {
        const invoice = await service.create({
          number: 'C-001',
          customerName: 'Tenant C',
          customerEmail: 'c@example.test',
          customerTaxId: '333',
          lines: [{ description: 'Line', quantity: 1, unitCents: 100, totalCents: 100 }],
        });
        await service.addPayment(invoice.id, {
          providerRef: 'provider-001',
          paidCents: 100,
          paidAt: new Date().toISOString(),
        });
        await expect(service.softDelete(invoice.id)).rejects.toBeInstanceOf(SoftDeleteBlockedError);
      });
    } finally {
      await app.teardown();
    }
  });
});
```

`[GAP — the test snippet assumes a bundler/test runner that can import SQL via
`?raw`. If the repo uses plain Vitest without raw import support, load the SQL
with `readFileSync` from a test fixture instead.]`

---

## Annotations — why the port is shaped this way

1. **Migration helper is the default authoring surface.** `data.create_soft_deletable_table`
   emits live table, archive mirror, RLS, indexes, and audit wiring, closing
   I5/I6/I8 per [`08-MIGRATION-PATTERNS.md`](../08-MIGRATION-PATTERNS.md).
2. **The FK behaviors are intentional.** `invoice_line.invoice_id` is
   `cascade`, `invoice_payment.invoice_id` is `block`, and
   `invoice.approved_by_user_id` is nullable `hide`, matching
   [`16-SPEC-EXCERPTS/soft-delete-model.md`](../16-SPEC-EXCERPTS/soft-delete-model.md).
3. **PII has non-nullify strategies.** `customer_email` and `customer_tax_id`
   use `hash_with_salt`; `customer_name` uses `tombstone`, all through
   `core.pii_map` for `@stynx-nyx/privacy`.
4. **The service never imports `pg` or S3 clients.** `Database.tx` and
   `DocumentsService` close I1 and I3.
5. **Routes carry the HTTP contract.** `@ReadOnly`, `@Permission`,
   `@RateLimit`, `@Idempotent`, and `@Audit` are all real public exports
   verified in the package barrels named by
   [`05-PACKAGE-CATALOG.md`](../05-PACKAGE-CATALOG.md).
6. **Frontend code keeps STYNX concerns out of page logic.** The SDK injects
   auth and tenant headers; Angular packages provide permission directives,
   tenant switching, and upload UI per [`09-FRONTEND-PATTERNS.md`](../09-FRONTEND-PATTERNS.md).
7. **Tests stay focused.** They prove RLS isolation, block FK behavior, and
   service access through request context; broader browser/linter gates belong
   to full CI.
