# Operational Conventions

## Cognito Public Client Policy
- st-core only supports Cognito app clients without secrets. The bootstrap CLI deletes any legacy `COGNITO_CLIENT_SECRET` entries and refuses to reuse clients that still have secrets unless you pass `--force`.
- Allowed flows are limited to `code` and `implicit`, with OAuth scopes `email`, `openid`, and `profile`. The CLI enforces these settings whenever it creates or updates a client.
- If AWS returns an app client that still exposes a secret, the bootstrap command aborts. Remove the legacy client or re-run with `--force` after manually resolving the mismatch.

## Environment Synchronization Requirements
- Every bootstrap or sync run compares `backend/.env` with the sibling reference environment file that seeded this project. Missing keys are surfaced with masked values so you can copy them across quickly.
- Run `npx tsx bootstrap/index.ts configure --sync-env` (or add `--yes`) to import missing keys automatically. Sensitive keys such as `COGNITO_CLIENT_SECRET` are intentionally skipped and removed to keep Cognito public clients compliant.
- The persisted `.env` file is rewritten alphabetically and mirrored into Angular environment files to ensure `COGNITO_REGION`, `COGNITO_USERPOOL_ID`, and `COGNITO_CLIENT_ID` stay aligned.

## Recommended Workflow
1. Execute `npx tsx bootstrap/index.ts configure --sync-env` to reconcile configuration against the reference baseline.
2. Provision infrastructure with `npx tsx bootstrap/index.ts up --with-s3 --with-cloudfront --with-db`.
3. Use `npx tsx bootstrap/index.ts sync` regularly so `.env` reflects the real AWS resource IDs and keeps the Angular environment files fresh.
