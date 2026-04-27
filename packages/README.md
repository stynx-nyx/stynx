# stynx Packages

This workspace contains the reusable, installable platform packages.

- `contracts`: framework-agnostic contracts and error types.
- `backend`: NestJS shared infrastructure modules.
- `core`: core runtime primitives, request context, config, and shared error handling.
- `data`: data access foundation, migrations, archive-aware delete/restore helpers, and query extensions.
- `health`: health, readiness, metrics, and `/info` endpoints.
- `logging`: structured logging primitives and dedupe behavior.
- `sessions`: Redis-backed sessions, refresh rotation, JWT/JWKS signing, and durable session mirrors.
- `auth`: authentication adapters and runtime primitives, including Cognito token verification and admin operations.
- `storage`: storage adapters and document primitives, including the S3 object storage service.
- `tenancy`: tenant resolution, membership validation, and tenant lifecycle orchestration.
- `audit`: audit adapters and helpers, including the SQL audit sink and reader.
- `ratelimit`: request throttling primitives and durable store adapters.
- `idempotency`: response replay primitives and durable store adapters.
- `testing`: container-backed app harnesses, matchers, fixtures, and doctor helpers for consumer apps.
- `privacy`: PII map loading, subject export/erasure flows, retention planning, and ROPA generation.
- `i18n`: catalog aggregation, locale resolution, and localized error rendering.
- `cli`: workspace bootstrapping, migrations, doctor checks, privacy ROPA output, and adoption helpers.
