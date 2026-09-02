# STYNX legacy registry deprecation plan

**Status:** Prepared; not authorized for execution

**Prepared:** 2026-08-31

**Registry:** `https://npm.pkg.github.com`

## Exact intent

The plan marks, but never deletes or retags, these immutable versions:

- `@stynx-nyx/angular-profile@2.0.0` with
  `Incorrect major version; migrate to ^1.1.1`;
- every observed `0.5.0` and `1.0.x` version in the 38-package legacy roster
  with `Legacy STYNX line; migrate to ^1.1.2`.

The six packages first published at 1.1.1 (`jobs`, `mobile-runtime`,
`notifications`, `offline-sync`, `outbox`, and `worklist`) have no legacy range
and are not targets.

## Fixed legacy roster

```text
@stynx-nyx/angular
@stynx-nyx/angular-audit
@stynx-nyx/angular-auth
@stynx-nyx/angular-flow
@stynx-nyx/angular-i18n
@stynx-nyx/angular-iam
@stynx-nyx/angular-profile
@stynx-nyx/angular-sessions
@stynx-nyx/angular-storage
@stynx-nyx/angular-tenancy
@stynx-nyx/angular-trash
@stynx-nyx/angular-ui
@stynx-nyx/audit
@stynx-nyx/auth
@stynx-nyx/backend
@stynx-nyx/cli
@stynx-nyx/contracts
@stynx-nyx/core
@stynx-nyx/data
@stynx-nyx/feature-flags
@stynx-nyx/flow
@stynx-nyx/health
@stynx-nyx/i18n
@stynx-nyx/idempotency
@stynx-nyx/integration-adapter
@stynx-nyx/logging
@stynx-nyx/pdf
@stynx-nyx/pdf-a
@stynx-nyx/pdf-a-vera-docker
@stynx-nyx/preferences
@stynx-nyx/privacy
@stynx-nyx/ratelimit
@stynx-nyx/sdk
@stynx-nyx/sessions
@stynx-nyx/signature
@stynx-nyx/storage
@stynx-nyx/tenancy
@stynx-nyx/testing
```

## Fail-closed execution recipe

1. Authenticate to GitHub Packages with a separately supplied Owner token that
   has package-write authority. Do not use the release lane token implicitly.
2. Re-query every roster package. Require `latest=1.1.2`, require `1.1.2` to be
   present, and require the legacy target population to contain only `0.5.0` and
   `1.0.x` versions.
3. Re-query `@stynx-nyx/angular-profile`; additionally require immutable
   `2.0.0` and `latest=1.1.2`.
4. Materialize the exact package/version/message tuples as canonical JSON and
   record its SHA-256 outside the repository.
5. Ask the Owner to approve that exact digest and executing identity.
6. For each approved legacy package, execute the equivalent of:

   ```sh
   npm deprecate '@stynx-nyx/<name>@>=0.5.0 <1.1.0' \
     'Legacy STYNX line; migrate to ^1.1.2' \
     --registry https://npm.pkg.github.com
   ```

7. Separately execute the exact anomaly command:

   ```sh
   npm deprecate '@stynx-nyx/angular-profile@2.0.0' \
     'Incorrect major version; migrate to ^1.1.1' \
     --registry https://npm.pkg.github.com
   ```

8. Re-observe every exact target and record the returned deprecation message.
   Verify that `1.1.2`, `latest`, package visibility, and tarball integrity did
   not change.

Any missing version, extra matching version, changed `latest`, authentication
error, partial command failure, or message mismatch stops the run. Recovery is
another exact Owner authorization; deletion, unpublish, and dist-tag mutation are
never implied.
