---
title: '@stynx-web/angular-audit'
---

# @stynx-web/angular-audit

Angular 20 audit UI for STYNX. It provides guarded audit log, event detail, entity history, and hash-integrity components backed by a `StynxSdkClient`-compatible client.

## Install

```bash
pnpm add @stynx-web/angular-audit
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/forms ^20.2.0`
- `@angular/router ^20.2.0`
- `@stynx-web/angular workspace:*`
- `@stynx-web/angular-auth workspace:*`
- `@stynx-web/angular-i18n workspace:*`
- `@stynx-web/angular-ui workspace:*`
- `@stynx-web/sdk workspace:*`

## Use

```ts
import { provideStynxDefaults } from '@stynx-web/angular';
import { auditRoutes, provideStynxAudit } from '@stynx-web/angular-audit';
import { StynxSdkClient } from '@stynx-web/sdk';

const client = new StynxSdkClient({ baseUrl: '/api', fetchFn: fetch });

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxDefaults({
      audit: provideStynxAudit({
        clientFactory: () => client,
      }),
    }),
  ],
});

export const routes = [{ path: 'audit', children: auditRoutes() }];
```

## Public Surface

- Providers/routes: `provideStynxAudit`, `AUDIT_ROUTES`, `auditRoutes`.
- Components: `StynxAuditLogComponent`, `StynxAuditEventDetailComponent`, `StynxEntityHistoryComponent`, `StynxAuditHashIntegrityBadgeComponent`.
- Services/tokens: `AuditApiService`, `STYNX_AUDIT_CLIENT`, `STYNX_AUDIT_OPTIONS`.
- Types/constants: audit package options and `STYNX_AUDIT_DEFAULT_PERMISSION`.
- Secondary exports: `@stynx-web/angular-audit/testing`, locale catalogs.

## See Also

- [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth)
- [`@stynx-web/angular-iam`](/docs/packages-web/angular-iam)
- [Reference app demo](/docs/reference/web#demo-surfaces)
