# Before / After — A Controller

> Companion to [`04-INVARIANTS-AND-CONTRACTS.md`](../04-INVARIANTS-AND-CONTRACTS.md),
> [`07-AUTH-AND-TENANCY-PATTERNS.md`](../07-AUTH-AND-TENANCY-PATTERNS.md),
> and [`16-SPEC-EXCERPTS/permission-model.md`](../16-SPEC-EXCERPTS/permission-model.md).
> The "After" section mirrors the guard/decorator shape in
> `reference/api/src/sample/records.controller.ts` and
> `reference/api/src/app.module.ts`.

This example ports a NestJS controller that verifies JWTs in ad-hoc
middleware and passes `organizationId` through every method. The STYNX
rewrite makes auth, permission checks, rate limits, idempotency, tenancy, and
audit explicit at the route boundary.

---

## Before — hand-rolled JWT middleware and route checks

```typescript
// src/invoices/invoices.controller.ts (FOREIGN — pre-port)
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { InvoiceService } from './invoice.service';
import type { CreateInvoiceDto, UpdateInvoiceDto } from './dto';

type LegacyPrincipal = {
  sub: string;
  org_id: string;
  roles?: string[];
  permissions?: string[];
};

function hasPermission(principal: LegacyPrincipal, permission: string): boolean {
  return principal.permissions?.includes(permission) || principal.roles?.includes('admin') || false;
}

@Controller('/api/invoices')
export class InvoiceController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly jwt: JwtService,
  ) {}

  private async principal(req: Request): Promise<LegacyPrincipal> {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('missing bearer token');
    const decoded = await this.jwt.verifyAsync<LegacyPrincipal>(token);
    if (!decoded.org_id) throw new UnauthorizedException('missing org claim');
    return decoded;
  }

  @Get()
  async list(@Req() req: Request) {
    const user = await this.principal(req);
    if (!hasPermission(user, 'invoice:read')) throw new ForbiddenException();
    return this.invoices.list(user.org_id);
  }

  @Get('/:id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const user = await this.principal(req);
    if (!hasPermission(user, 'invoice:read')) throw new ForbiddenException();
    return this.invoices.get(user.org_id, id);
  }

  @Post()
  async create(
    @Req() req: Request,
    @Headers('Idempotency-Key') key: string | undefined,
    @Body() body: CreateInvoiceDto,
  ) {
    const user = await this.principal(req);
    if (!hasPermission(user, 'invoice:write')) throw new ForbiddenException();
    return this.invoices.create(user.org_id, user.sub, body, key);
  }

  @Put('/:id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateInvoiceDto) {
    const user = await this.principal(req);
    if (!hasPermission(user, 'invoice:write')) throw new ForbiddenException();
    return this.invoices.update(user.org_id, user.sub, id, body);
  }

  @Delete('/:id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = await this.principal(req);
    if (!hasPermission(user, 'invoice:delete')) throw new ForbiddenException();
    return this.invoices.markDeleted(user.org_id, user.sub, id);
  }
}
```

### Why this is unsafe to port unchanged

| Symptom                                                             | Rule          | Citation                                                                                            |
| ------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| The route trusts `org_id` from the JWT and passes it as an argument | I2/I5         | [`16-SPEC-EXCERPTS/tenancy-model.md`](../16-SPEC-EXCERPTS/tenancy-model.md) tenant resolution order |
| Permissions are checked by local helper logic                       | I4            | [`04-INVARIANTS-AND-CONTRACTS.md`](../04-INVARIANTS-AND-CONTRACTS.md) route contract                |
| No rate-limit metadata                                              | HTTP contract | [`04-INVARIANTS-AND-CONTRACTS.md`](../04-INVARIANTS-AND-CONTRACTS.md) cross-cutting contract        |
| Idempotency key is passed to business code manually                 | HTTP contract | [`16-SPEC-EXCERPTS/permission-model.md`](../16-SPEC-EXCERPTS/permission-model.md) decorator example |
| Mutations have no `@Audit` action labels                            | I6            | [`16-SPEC-EXCERPTS/audit-model.md`](../16-SPEC-EXCERPTS/audit-model.md) layer choice                |

---

## After — STYNX guards, decorators, and module wiring

```typescript
// src/invoices/invoices.controller.ts (after port)
import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
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
} from '@stynx/auth';
import { StynxDataModule } from '@stynx/data';
import { StynxTenancyModule } from '@stynx/tenancy';
import { StynxLoggingModule } from '@stynx/logging';
import { Audit, StynxPlatformPipelineModule } from '@stynx/backend';
import { Idempotent } from '@stynx/idempotency';
import { RateLimit } from '@stynx/ratelimit';
import { InvoiceService } from './invoice.service';
import type { CreateInvoiceDto, ListInvoiceQuery, UpdateInvoiceDto } from './dto';

@Controller('/invoices')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class InvoicesController {
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
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.create', cost: 2 })
  @Audit({ action: 'billing.invoice.create', entity: 'billing.invoice' })
  create(@Body() body: CreateInvoiceDto) {
    return this.invoices.create(body);
  }

  @Patch('/:id')
  @Permission('billing:invoice:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.update', cost: 2 })
  @Audit({ action: 'billing.invoice.update', entity: 'billing.invoice' })
  update(@Param('id') id: string, @Body() body: UpdateInvoiceDto) {
    return this.invoices.update(id, body);
  }

  @Delete('/:id')
  @Permission('billing:invoice:delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.delete', cost: 3 })
  @Audit({ action: 'billing.invoice.soft-delete', entity: 'billing.invoice' })
  remove(@Param('id') id: string) {
    return this.invoices.softDelete(id);
  }

  @Post('/:id/restore')
  @Permission('billing:invoice:restore')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'billing.invoices.restore', cost: 2 })
  @Audit({ action: 'billing.invoice.restore', entity: 'billing.invoice' })
  restore(@Param('id') id: string) {
    return this.invoices.restore(id);
  }
}

@Module({
  imports: [
    StynxLoggingModule.forRoot(),
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
    StynxAuthModule.forRoot({
      stynx: { issuer: process.env.STYNX_STYNX_ISSUER ?? 'https://stynx.local' },
      cognito: { issuer: process.env.STYNX_COGNITO_ISSUER ?? 'https://cognito.local' },
    }),
    StynxTenancyModule.forRoot({}),
    StynxPlatformPipelineModule.forRoot({
      rateLimit: { defaultLimit: 120, defaultWindowSeconds: 60 },
      idempotency: { ttlMs: 24 * 60 * 60 * 1000 },
    }),
  ],
  controllers: [InvoicesController],
  providers: [InvoiceService, StynxAuthGuard, PermissionGuard],
})
export class BillingModule {}
```

`[GAP — the inline fallback connection strings are documentation-only.
Production apps should inject these values from their configuration module,
matching the shape used by `reference/api/src/app.module.ts`.]`

---

## Annotations — what changed and why

1. **JWT verification moved out of the controller.** `StynxAuthGuard`
   from `@stynx/auth` validates the bearer token, loads the session, and
   exposes the principal to the request pipeline. This follows
   [`07-AUTH-AND-TENANCY-PATTERNS.md`](../07-AUTH-AND-TENANCY-PATTERNS.md)
   "replace JWT middleware with `StynxAuthGuard`".

2. **Permission checks are declarative.** `@Permission(...)` metadata is
   read by `PermissionGuard`; every route is visibly covered, satisfying
   invariant I4 in [`04-INVARIANTS-AND-CONTRACTS.md`](../04-INVARIANTS-AND-CONTRACTS.md).

3. **Read routes are marked `@ReadOnly()`.** This selects the
   `stynx_reader` role and a read-only transaction path, closing I7 from
   [`16-SPEC-EXCERPTS/invariants.md`](../16-SPEC-EXCERPTS/invariants.md).

4. **Mutations are idempotent by default.** `@Idempotent()` from
   `@stynx/idempotency` handles the `Idempotency-Key` replay contract; the
   service no longer stores or compares keys manually.

5. **Rate limits use route metadata.** `@RateLimit(...)` from
   `@stynx/ratelimit` is resolved by the platform pipeline and can be backed
   by Redis or PostgreSQL, as cataloged in
   [`05-PACKAGE-CATALOG.md`](../05-PACKAGE-CATALOG.md).

6. **Audit action labels are explicit.** Row-level audit is DB-triggered,
   but `@Audit(...)` from `@stynx/backend` supplies stable route/action
   names for forensics. See
   [`16-SPEC-EXCERPTS/audit-model.md`](../16-SPEC-EXCERPTS/audit-model.md).

7. **Tenant id disappears from method signatures.** The tenancy interceptor
   resolves `X-Tenant-Id` or token claim into request context; `Database.tx`
   sets `app.tenant_id` for RLS. This is the key change described in
   [`16-SPEC-EXCERPTS/tenancy-model.md`](../16-SPEC-EXCERPTS/tenancy-model.md).

### Imports verified against public barrels

| Symbol                                                                           | Package              | Verified source                     |
| -------------------------------------------------------------------------------- | -------------------- | ----------------------------------- |
| `Permission`, `ReadOnly`, `StynxAuthGuard`, `PermissionGuard`, `StynxAuthModule` | `@stynx/auth`        | `packages/auth/src/index.ts`        |
| `StynxDataModule`                                                                | `@stynx/data`        | `packages/data/src/index.ts`        |
| `StynxTenancyModule`                                                             | `@stynx/tenancy`     | catalog 05 §`@stynx/tenancy`        |
| `Audit`, `StynxPlatformPipelineModule`                                           | `@stynx/backend`     | `packages/backend/src/index.ts`     |
| `Idempotent`                                                                     | `@stynx/idempotency` | `packages/idempotency/src/index.ts` |
| `RateLimit`                                                                      | `@stynx/ratelimit`   | `packages/ratelimit/src/index.ts`   |
