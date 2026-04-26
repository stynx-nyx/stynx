# Bootstrap CLI

This TypeScript CLI configures and manages stynx infrastructure end-to-end. Run it with `npx tsx bootstrap/index.ts <command>`.

Target resolution is package-first:
- backend build target prefers `@stynx/reference-api` (legacy fallback: `backend`)
- frontend build/deploy target prefers `@stech/reference-frontend` (legacy fallback: `frontend`)

## Commands

- `configure` – interactively capture environment variables and persist to `apps/reference-api/.env` (with legacy mirror when present) and frontend environment files.
- `db` – apply database DDL/seed files, optionally dropping/recreating the database.
- `up` – ensure Cognito, S3, CloudFront resources exist and persist identifiers.
- `deploy-frontend` – build the Angular app, push assets to S3, and invalidate CloudFront.
- `deploy-backend` – build the NestJS backend and emit deployment placeholders for EC2.
- `sync` – reconcile backend/frontend environment files with live AWS resources.
- `teardown` – delete cloud resources and optionally drop the database.

## Global Flags

- `--profile <name>` – AWS profile to use. Defaults to `AWS_PROFILE` env or `default`.
- `--region <name>` – AWS region. Defaults to `AWS_REGION` or `us-east-1`.
- `--dry-run` – Show actions without executing.
- `--yes` – Assume "yes" to prompts.
- `--non-interactive` – Disable prompts (CI friendly).
- `--debug` – Verbose logging.

Each command exposes additional flags (`--seed`, `--recreate`, `--invalidate`, `--with-s3`, `--with-cloudfront`, `--with-db`, `--sync-env-source`, etc.) – run with `--help` for details.

All operations are idempotent, tagged `{App=<APP_NAME>, Project=stynx}`, and synchronize results back to reference app env files so subsequent runs stay consistent.
