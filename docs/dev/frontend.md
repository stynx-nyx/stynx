# Frontend Modernization Guide

This document captures the shared Angular conventions derived from the PORM and PEC applications and applied to st-core.

## Project Structure
- Components live under `frontend/src/app/**` as standalone components.
- Templates and styles are externalised (`component.html`, `component.scss`).
- Shared widgets reside in `@shared`, admin tooling under `@admin`, and storage utilities under `@storage`.

## Coding Patterns
- **Control Flow:** Use Angular’s `@if`, `@else`, `@for`, and `@switch` syntax instead of legacy `*ngIf` / `*ngFor` directives.
- **Dependency Injection:** Replace constructor DI with the functional `inject()` API:
  ```ts
  import { inject } from '@angular/core';
  const api = inject(ApiService);
  ```
- **Signals & Observables:** Components may expose Angular signals for state (`signal`, `computed`) while continuing to compose Observables for HTTP workflows.
- **Styling:** Prefer SCSS modules collocated with the component. Use BEM-inspired utility classes for shared patterns.

## Feature Modules
- **Admin / Users:** The user management console includes list & detail views, role assignment, tenancy affiliation, and confirmation workflows. Services call stubbed endpoints under `/admin/users/*`.
- **Admin / Roles & Tenancies:** Lightweight shells exist for future expansion, reusing the shared `ApiService`.
- **Storage:** Metadata is registered through the storage explorer and audited via backend middleware.

## Testing
- Frontend Jest tests live in `test/frontend`. For admin tooling, see `test/frontend/admin-users` for service/component stubs and shallow rendering examples.
- Use Angular’s standalone testing style (`imports: [ComponentUnderTest]`) and mock services via providers.

## Environment
- Frontend builds read configuration from `frontend/src/environments/*.ts`. Backend secrets live in `backend/.env` (see `.env.example`).

## Lint & Build
Execute linting and unit tests from the frontend workspace:
```bash
(cd frontend && npm run lint)
(cd frontend && npm run test)
(cd frontend && npm run build)
```
