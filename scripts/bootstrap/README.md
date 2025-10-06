# Bootstrap CLI

This TypeScript CLI configures and manages st-core infrastructure end-to-end. Run it with `npx tsx scripts/bootstrap/index.ts <command>`.

## Commands

- `configure` – interactively capture environment variables and persist to `backend/.env` and Angular environments.
- `db` – apply database DDL/seed files, optionally dropping/recreating the database.
- `up` – ensure Cognito, S3, CloudFront resources exist and persist identifiers.
- `deploy-frontend` – build the Angular app, push assets to S3, and invalidate CloudFront.
- `deploy-backend` – build the NestJS backend and emit deployment placeholders for EC2.
- `sync` – reconcile `.env` and Angular environment files with live AWS resources.
- `teardown` – delete cloud resources and optionally drop the database.

## Global Flags

- `--profile <name>` – AWS profile to use. Defaults to `AWS_PROFILE` env or `default`.
- `--region <name>` – AWS region. Defaults to `AWS_REGION` or `us-east-1`.
- `--dry-run` – Show actions without executing.
- `--yes` – Assume "yes" to prompts.
- `--non-interactive` – Disable prompts (CI friendly).
- `--debug` – Verbose logging.

Each command exposes additional flags (`--seed`, `--recreate`, `--invalidate`, `--with-s3`, `--with-cloudfront`, `--with-db`, etc.) – run with `--help` for details.

All operations are idempotent, tagged `{App=<APP_NAME>, Project=st-core}`, and synchronize results back to `backend/.env` so subsequent runs stay consistent.
