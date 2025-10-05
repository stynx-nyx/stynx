# Open Questions & Follow-ups

- [ ] Provide production Cognito configuration (user pool domain, client secret rotation, redirect URIs) and align with environment variables in `backend/src/config/configuration.ts`.
- [ ] Wire real storage upload flow (presigned URLs) and surface upload progress in `StorageExplorerComponent`.
- [ ] Expand backend test coverage to include integration tests with ephemeral Postgres (e.g., Testcontainers) similar to PORM.
- [ ] Replace placeholder login form with actual OAuth2 code flow (PKCE) using `angular-oauth2-oidc`.
- [ ] Populate `docs/api/openapi.json` via `scripts/docs-generate.sh` and version the schema.
- [ ] Integrate scripts/pipeline-stub.yml into target CI tooling and add deployment steps.
- [ ] Add root workspace package.json so `npm run --workspace` commands succeed and wire lint/test/build scripts.
- [ ] Implement real backend endpoints for admin role/tenancy APIs and align service contracts.
