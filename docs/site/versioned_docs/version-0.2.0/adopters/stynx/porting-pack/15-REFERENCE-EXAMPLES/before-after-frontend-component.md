# Before / After — A Frontend Component

&gt; Companion to [`09-FRONTEND-PATTERNS.md`](../09-FRONTEND-PATTERNS.md),
&gt; [`07-AUTH-AND-TENANCY-PATTERNS.md`](../07-AUTH-AND-TENANCY-PATTERNS.md),
&gt; and [`16-SPEC-EXCERPTS/tenancy-model.md`](../16-SPEC-EXCERPTS/tenancy-model.md).
&gt; The "After" section mirrors the standalone Angular bootstrap in
&gt; `reference/web/src/main.ts` and the shell pattern in
&gt; `reference/web/src/app/app.component.ts`.

This example ports an Angular page that manually appends bearer and tenant
headers. The STYNX version delegates auth replay, request IDs, tenant headers,
permission gating, and document upload to `@stynx-nyx/*` packages.

---

## Before — hand-rolled HTTP, auth, tenant, and upload state

```typescript
// src/app/invoices.component.ts (FOREIGN — pre-port)
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface InvoiceRow {
  id: string;
  number: string;
  customerName: string;
  totalCents: number;
  status: 'draft' | 'issued' | 'paid';
}

@Component({
  standalone: true,
  selector: 'legacy-invoices',
  imports: [CommonModule, NgFor, NgIf],
  template: `
    <header>
      <select [value]="tenantId()" (change)="switchTenant($event)">
        <option value="org-a">Org A</option>
        <option value="org-b">Org B</option>
      </select>
      <button (click)="load()">Reload</button>
      <button *ngIf="canWrite()" (click)="create()">New invoice</button>
    </header>

    <p *ngIf="error()">{{ error() }}</p>
    <ul>
      <li *ngFor="let invoice of invoices()">
        {{ invoice.number }} — {{ invoice.customerName }} — {{ invoice.status }}
        <button *ngIf="canWrite()" (click)="remove(invoice.id)">Delete</button>
        <input type="file" (change)="upload(invoice.id, $event)" />
      </li>
    </ul>
  `,
})
export class LegacyInvoicesComponent {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api';
  readonly tenantId = signal(localStorage.getItem('org_id') ?? 'org-a');
  readonly invoices = signal<InvoiceRow[]>([]);
  readonly error = signal<string | null>(null);

  private headers(extra: Record<string, string> = {}) {
    const token = localStorage.getItem('access_token');
    return new HttpHeaders({
      Authorization: token ? `Bearer ${token}` : '',
      'X-Organization-Id': this.tenantId(),
      ...extra,
    });
  }

  async load() {
    try {
      this.error.set(null);
      const rows = await firstValueFrom(
        this.http.get<InvoiceRow[]>(`${this.apiUrl}/invoices`, { headers: this.headers() }),
      );
      this.invoices.set(rows);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Load failed');
    }
  }

  async create() {
    const idempotencyKey = `invoice-${Date.now()}`;
    await firstValueFrom(
      this.http.post(
        `${this.apiUrl}/invoices`,
        {
          customerName: 'New customer',
          totalCents: 0,
        },
        { headers: this.headers({ 'Idempotency-Key': idempotencyKey }) },
      ),
    );
    await this.load();
  }

  async remove(id: string) {
    await firstValueFrom(
      this.http.delete(`${this.apiUrl}/invoices/${id}`, { headers: this.headers() }),
    );
    await this.load();
  }

  async upload(invoiceId: string, event: Event) {
    const file = (event.target as HTMLInputElement).files?.item(0);
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    body.append('invoiceId', invoiceId);
    await firstValueFrom(
      this.http.post(`${this.apiUrl}/invoice-files`, body, {
        headers: this.headers(),
      }),
    );
  }

  switchTenant(event: Event) {
    const next = (event.target as HTMLSelectElement).value;
    localStorage.setItem('org_id', next);
    this.tenantId.set(next);
    void this.load();
  }

  canWrite(): boolean {
    return (localStorage.getItem('permissions') ?? '').split(',').includes('invoice:write');
  }
}
```

### What this component violates

| Symptom                                                  | Rule                   | Citation                                                                                                |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Manual `Authorization` header and no refresh replay      | Frontend auth contract | [`09-FRONTEND-PATTERNS.md`](../09-FRONTEND-PATTERNS.md) 401 refresh flow                                |
| Uses `X-Organization-Id` instead of STYNX tenant context | Tenancy model          | [`16-SPEC-EXCERPTS/tenancy-model.md`](../16-SPEC-EXCERPTS/tenancy-model.md) tenant resolution           |
| Permissions are parsed from local storage                | Permission model       | [`16-SPEC-EXCERPTS/permission-model.md`](../16-SPEC-EXCERPTS/permission-model.md) cached permission set |
| Upload sends raw multipart to app API                    | I3                     | [`04-INVARIANTS-AND-CONTRACTS.md`](../04-INVARIANTS-AND-CONTRACTS.md) no direct object bypass           |

---

## After — STYNX Angular shell plus SDK calls

```typescript
// src/main.ts + src/app/invoices.page.ts (after port)
import '@angular/compiler';
import 'zone.js';
import { CommonModule, NgFor } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { StynxAngularModule } from '@stynx-nyx/angular';
import {
  StynxAngularAuthModule,
  StynxHasPermissionDirective,
  StynxSessionService,
} from '@stynx-nyx/angular-auth';
import {
  TenantContextService,
  TenantSwitcherComponent,
  type TenantOption,
} from '@stynx-nyx/angular-tenancy';
import {
  DocumentService,
  STYNX_UPLOAD_EXECUTOR,
  StynxDocumentUploadComponent,
  XhrUploadExecutor,
} from '@stynx-nyx/angular-storage';
import { StynxSdkClient } from '@stynx-nyx/sdk';
import { environment } from './environments/environment';

interface InvoiceRow {
  id: string;
  number: string;
  customerName: string;
  totalCents: number;
  status: 'draft' | 'issued' | 'paid';
}

@Component({
  standalone: true,
  selector: 'app-invoices',
  imports: [
    CommonModule,
    NgFor,
    TenantSwitcherComponent,
    StynxHasPermissionDirective,
    StynxDocumentUploadComponent,
  ],
  template: `
    <header>
      <stynx-tenant-switcher [tenants]="tenants" (tenantChange)="switchTenant($event)">
      </stynx-tenant-switcher>
      <button type="button" (click)="load()">Reload</button>
      <button type="button" *stynxHasPermission="'billing:invoice:write'" (click)="create()">
        New invoice
      </button>
    </header>

    <ul>
      <li *ngFor="let invoice of invoices()">
        {{ invoice.number }} — {{ invoice.customerName }} — {{ invoice.status }}
        <button
          type="button"
          *stynxHasPermission="'billing:invoice:delete'"
          (click)="remove(invoice.id)"
        >
          Delete
        </button>
        <stynx-document-upload
          collection="invoice-attachments"
          [allowedMimes]="['application/pdf', 'image/png']"
          [maxBytes]="15 * 1024 * 1024"
          (completed)="load()"
        >
        </stynx-document-upload>
      </li>
    </ul>
  `,
})
export class InvoicesPage {
  private readonly session = inject(StynxSessionService);
  private readonly tenancy = inject(TenantContextService);
  readonly tenants: TenantOption[] = [
    { id: '01978f4a-32bf-7c27-a131-fd73a9e001a1', label: 'Demo tenant' },
    { id: '01978f4a-32bf-7c27-a131-fd73a9e001a2', label: 'Ops tenant' },
  ];
  readonly invoices = signal<InvoiceRow[]>([]);
  private readonly sdk = new StynxSdkClient({
    baseUrl: environment.apiBaseUrl,
    fetchFn: fetch,
    authProvider: this.session,
    tenantProvider: { getTenantId: () => this.tenancy.tenantId() },
  });

  async load() {
    this.invoices.set(await this.sdk.get<InvoiceRow[]>('/invoices'));
  }

  async create() {
    await this.sdk.post<InvoiceRow>(
      '/invoices',
      { customerName: 'New customer', totalCents: 0 },
      {
        headers: { 'Idempotency-Key': `invoice-create-${crypto.randomUUID()}` },
      },
    );
    await this.load();
  }

  async remove(id: string) {
    await this.sdk.delete<{ status: string; id: string }>(`/invoices/${id}`, {
      headers: { 'Idempotency-Key': `invoice-delete-${id}-${crypto.randomUUID()}` },
    });
    await this.load();
  }

  async switchTenant(tenantId: string) {
    await this.session.switchTenant(tenantId);
    await this.load();
  }
}

void bootstrapApplication(InvoicesPage, {
  providers: [
    importProvidersFrom(
      StynxAngularModule.forRoot({
        apiBaseUrl: environment.apiBaseUrl,
        sessionMode: 'bearer',
        defaultTenantResolver: async () => '01978f4a-32bf-7c27-a131-fd73a9e001a1',
      }),
      StynxAngularAuthModule.forRoot({
        oidc: {
          authority: environment.apiBaseUrl,
          clientId: 'billing-web',
          redirectUrl: `${environment.appBaseUrl}/login`,
          postLogoutRedirectUri: `${environment.appBaseUrl}/login`,
          scope: 'openid profile email',
          responseType: 'code',
          secureRoutes: [environment.apiBaseUrl],
        },
      }),
    ),
    DocumentService,
    XhrUploadExecutor,
    { provide: STYNX_UPLOAD_EXECUTOR, useExisting: XhrUploadExecutor },
  ],
});
```

`[GAP — the example uses one SDK instance inside the component for compactness.
In production Angular apps, provide a singleton API service as in
`reference/web/src/app/core/reference-web-api.service.ts` so test fakes and
route resolvers can share the same client.]`

---

## Annotations — what changed and why

1. **Header logic moved to STYNX packages.** `StynxSdkClient` injects bearer
   and tenant headers through `AuthProvider` / `TenantProvider`; the Angular
   module also installs request-id, auth, and error interceptors. See
   [`09-FRONTEND-PATTERNS.md`](../09-FRONTEND-PATTERNS.md) "Headers the
   transport sets for you".

2. **Tenant switching rotates the session.** `StynxSessionService.switchTenant`
   revokes the old STYNX bearer and mints a new tenant-bound one, matching
   [`16-SPEC-EXCERPTS/tenancy-model.md`](../16-SPEC-EXCERPTS/tenancy-model.md)
   §5.5.

3. **Permission UI uses directive state.** `*stynxHasPermission` reads the
   active session permission set; no local-storage parsing. The route-side
   enforcement still lives on backend `@Permission`.

4. **Uploads use the storage package.** `&lt;stynx-document-upload&gt;` performs
   initiate → presigned S3 PUT → complete through `@stynx-nyx/angular-storage`;
   the backend still uses `@stynx-nyx/storage`, satisfying invariant I3.

5. **Idempotency remains explicit at call sites.** STYNX handles replay on the
   server, but clients still supply unique keys for retryable mutations.

### Imports verified against public barrels

| Symbol                                                                                          | Package                      | Verified source                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------- |
| `StynxSdkClient`, `AuthProvider`, `TenantProvider`                                              | `@stynx-nyx/sdk`             | `packages-web/sdk/src/index.ts`             |
| `StynxAngularModule`                                                                            | `@stynx-nyx/angular`         | `packages-web/angular/src/index.ts`         |
| `StynxAngularAuthModule`, `StynxSessionService`, `StynxHasPermissionDirective`                  | `@stynx-nyx/angular-auth`    | `packages-web/angular-auth/src/index.ts`    |
| `TenantContextService`, `TenantSwitcherComponent`, `TenantOption`                               | `@stynx-nyx/angular-tenancy` | `packages-web/angular-tenancy/src/index.ts` |
| `DocumentService`, `StynxDocumentUploadComponent`, `XhrUploadExecutor`, `STYNX_UPLOAD_EXECUTOR` | `@stynx-nyx/angular-storage` | `packages-web/angular-storage/src/index.ts` |

---

## Appendix — React or other non-Angular consumers

```tsx
import { useEffect, useMemo, useState } from 'react';
import { StynxSdkClient, type AuthProvider, type TenantProvider } from '@stynx-nyx/sdk';

export function useInvoices(authProvider: AuthProvider, tenantProvider: TenantProvider) {
  const sdk = useMemo(
    () =>
      new StynxSdkClient({
        baseUrl: process.env.NEXT_PUBLIC_STYNX_API_URL!,
        fetchFn: fetch,
        authProvider,
        tenantProvider,
      }),
    [authProvider, tenantProvider],
  );

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    sdk.get<InvoiceRow[]>('/invoices', { signal: controller.signal }).then(setRows);
    return () => controller.abort();
  }, [sdk]);

  return { rows, sdk };
}
```

Non-Angular apps should keep their UI framework and use `@stynx-nyx/sdk` only.
Do not import Angular packages into React/Vue/Svelte bundles just to get auth
headers; the SDK has the framework-neutral contract.
