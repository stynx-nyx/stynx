# Developer Conventions

## Code Style

- **TypeScript everywhere** – Strict mode enabled. Avoid `any`; prefer typed DTOs and interfaces mirroring backend contracts.
- **Path aliases** – Use `@core`, `@shared`, `@admin`, `@storage`, `@env` (frontend) and `@core`, `@shared`, `@config` (backend). This mirrors PORM/PEC structures.
- **Formatting** – 2-space indentation, single quotes, LF line endings. Follow ESLint configs in each workspace.

## Backend Guidelines

- Keep domain-agnostic logic in `src/core`. Feature-specific modules should be implemented in downstream repos.
- Inject `DatabaseService` for every SQL call; never instantiate `pg` pools manually.
- Every mutating controller method must carry an `@Audit` decorator and apply relevant guards.
- Build DTOs with `class-validator`. Validation happens through the global `ValidationPipe`.

## Frontend Guidelines

- Prefer standalone components; collocate feature components under `admin` and `storage` packages.
- Use `AuthFacade` for authentication state. Avoid directly touching `CognitoAuthService` outside the core layer.
- Register new HTTP interceptors through `app.config.ts` using functional interceptors.
- Keep translations in `assets/i18n`. Always provide English and Portuguese strings.

## Testing Strategy

- **Database** – Add snapshot/assertion tests in `test/db` when altering DDL/seed files.
- **Backend** – Write unit tests in `packages/&lt;pkg&gt;/test/unit` using Vitest. Override providers instead of hitting real services.
- **Frontend** – Place component specs in `packages-web/angular*/test`.
- **Scripts** – Add assertions in `test/scripts` to ensure new scripts have shebangs and are executable.

## Documentation &amp; CI

- Update the relevant `docs/stynx/*` status page when importing new patterns.
- Track open questions or follow-ups in the owning spec, work prompt, or issue rather than root coordination files.
- Keep deployment scripts idempotent and parameterised; never hard-code environment specific credentials.
