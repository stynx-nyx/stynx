---
adr_id: ADR-VERSION-LINE-0001
title: Canonical 1.x package line and registry anomaly correction
status: accepted
date: 2026-08-23
authors: ['Architect']
tags: [stynx, release, semver, registry, packages]
---

# ADR-VERSION-LINE-0001 — Canonical 1.x package line and registry anomaly correction

**Authority:** Architect, implementing the Owner's superseding version-line decision of
2026-08-23 for repository baseline `6ab2107969bf72a15264925722a40d2336c8a0be`.

## Status

Accepted as the engineering decision for preparing a future candidate. This ADR authorizes no
registry mutation, publication, dist-tag change, deletion, push, merge, tag, release, deployment,
or repository-settings change.

## Context

STYNX publishes one fixed group of 38 `@stynx-nyx/*` packages. The repository manifests and
`latest` dist-tags are currently `0.5.0`, but the registry contains earlier `1.x` releases and one
erroneous `@stynx-nyx/angular-profile@2.0.0` release. The Owner has ruled that `2.0.0` is not a
canonical major-line decision, that STYNX remains on `1.x`, and that the next unified version is
exactly `1.1.1`.

The earlier `1.1.0` and `3.0.0` targets are withdrawn. `1.1.1` avoids collision with the valid
existing `@stynx-nyx/sessions@1.1.0` and `@stynx-nyx/angular-sessions@1.1.0` artifacts while
remaining selectable by valid `^1` consumer ranges.

### Exact entry and registry observation

The authoritative pre-mutation observation was made from clean `main` and `origin/main` at
`6ab2107969bf72a15264925722a40d2336c8a0be` on `2026-08-24T02:04:20.663Z` against
`https://npm.pkg.github.com`:

- 38 publishable package manifests were discovered.
- All 38 registry queries succeeded.
- All 38 `latest` dist-tags resolved to `0.5.0`.
- `1.1.1` was absent from all 38 version histories.
- The GitHub Packages API reported the sampled npm packages as `private`, contradicting the
  assessment's description of them as public packages. This ADR therefore uses “publishable
  packages” and requires visibility to be re-observed rather than assumed.
- GitHub's package and package-version REST responses did not expose download counts. Download
  count is `unknown`, not zero, and no deletion readiness may be inferred from it.

The authenticated census and downloaded historical tarballs were retained outside the repository
at `/tmp/stynx-version-line-evidence.Y3775F` for this local planning session. That temporary path is
non-promoting evidence and is not a durable release receipt.

### Complete registry census

| Package                          | `latest` | Highest observed | Versions |
| -------------------------------- | -------: | ---------------: | -------: |
| `@stynx-nyx/angular`             |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/angular-audit`       |  `0.5.0` |          `0.5.0` |        5 |
| `@stynx-nyx/angular-auth`        |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/angular-flow`        |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/angular-i18n`        |  `0.5.0` |          `1.0.2` |        4 |
| `@stynx-nyx/angular-iam`         |  `0.5.0` |          `0.5.0` |        5 |
| `@stynx-nyx/angular-profile`     |  `0.5.0` |          `2.0.0` |        6 |
| `@stynx-nyx/angular-sessions`    |  `0.5.0` |          `1.1.0` |        6 |
| `@stynx-nyx/angular-storage`     |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/angular-tenancy`     |  `0.5.0` |          `0.5.0` |        5 |
| `@stynx-nyx/angular-trash`       |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/angular-ui`          |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/audit`               |  `0.5.0` |          `1.0.4` |        6 |
| `@stynx-nyx/auth`                |  `0.5.0` |          `1.0.4` |        6 |
| `@stynx-nyx/backend`             |  `0.5.0` |          `1.0.4` |        6 |
| `@stynx-nyx/cli`                 |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/contracts`           |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/core`                |  `0.5.0` |          `1.0.2` |        4 |
| `@stynx-nyx/data`                |  `0.5.0` |          `1.0.2` |        4 |
| `@stynx-nyx/feature-flags`       |  `0.5.0` |          `0.5.0` |        5 |
| `@stynx-nyx/flow`                |  `0.5.0` |          `0.5.0` |        6 |
| `@stynx-nyx/health`              |  `0.5.0` |          `1.0.2` |        4 |
| `@stynx-nyx/i18n`                |  `0.5.0` |          `1.0.2` |        4 |
| `@stynx-nyx/idempotency`         |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/integration-adapter` |  `0.5.0` |          `0.5.0` |        5 |
| `@stynx-nyx/logging`             |  `0.5.0` |          `1.0.2` |        4 |
| `@stynx-nyx/pdf`                 |  `0.5.0` |          `1.0.2` |        5 |
| `@stynx-nyx/pdf-a`               |  `0.5.0` |          `0.5.0` |        5 |
| `@stynx-nyx/pdf-a-vera-docker`   |  `0.5.0` |          `0.5.0` |        5 |
| `@stynx-nyx/preferences`         |  `0.5.0` |          `0.5.0` |        2 |
| `@stynx-nyx/privacy`             |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/ratelimit`           |  `0.5.0` |          `1.0.4` |        6 |
| `@stynx-nyx/sdk`                 |  `0.5.0` |          `1.0.2` |        4 |
| `@stynx-nyx/sessions`            |  `0.5.0` |          `1.1.0` |        5 |
| `@stynx-nyx/signature`           |  `0.5.0` |          `0.5.0` |        5 |
| `@stynx-nyx/storage`             |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/tenancy`             |  `0.5.0` |          `1.0.3` |        5 |
| `@stynx-nyx/testing`             |  `0.5.0` |          `1.0.4` |        6 |

### Relevant immutable artifacts

| Artifact                            | GitHub version ID | npm integrity                                                                                     | Downloaded tarball SHA-256                                         |
| ----------------------------------- | ----------------: | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `@stynx-nyx/angular-profile@1.0.0`  |      `1017484200` | `sha512-We4via4G3j+OXSnSi0bTKyC5ys+FBSV+AXuQ/86z7SXRWX2Cs1nYkt1iyfwJWYfps7RBUakvfDfp0AyStQDapQ==` | `9eb1ca4726761e1263539b7bdd30a55772487d11d15a148e516126b6d467dabc` |
| `@stynx-nyx/angular-profile@2.0.0`  |      `1024692931` | `sha512-YVcTjo0jNNdn9/Xb2M5b/aeOjkU4fAPyYWsWuW0DFjOh+DJG87meWwfUbFBUgZiS6ZFntnaSOi9MHqrAGMXXtw==` | `7cefacd0535d0f5e7398a8a5d1e44d29415dd4aa234269d36eb28c97f25b7aee` |
| `@stynx-nyx/sessions@1.1.0`         |      `1024693065` | `sha512-4/UxToM7U4pozYPngXRtIolILjzzgihUHePu4Q8vFBip+YJXJrBKG3zqv5QEMW4wrMdHYonBdrIalky+09dz2A==` | `45770069613f08bb736bfe05799412fd5213356a4b53b3b4a0868a59de6decb8` |
| `@stynx-nyx/angular-sessions@1.1.0` |      `1024692918` | `sha512-Vcb/Axrl116t9e8oGE8Kx+XQvDJz1fx/HV34Gm9P9zyJ9e6JzoKBk0j9M7R9khH3CHCKkYwBZE8m1eVjHdshkQ==` | `94ea1cf1edc042872bac946fe2ef6ca4efacaba39ed320674908e8ae94e9c726` |

The registry census JSON SHA-256 was
`16f68b1cb29bbad3bc98fa97a6e133ab7a714ced5b00f2d024b2d223a30e31c1`.

## Decision

### D1. Canonical line and exact next version

The canonical package line is `1.x`. The next unified version is exactly `1.1.1` for all 38
publishable packages. No implementation or release task may substitute another version without a
new Owner decision.

`1.1.1` must be absent from every package immediately before candidate preparation and immediately
before publication. Presence in even one package blocks the entire release.

### D2. Complete fixed-group identity

The release unit is the deterministically discovered 38-package roster, not a hand-maintained
count. All public manifests, internal STYNX dependency ranges, changelogs, the root manifest,
create-app templates, SBOM data, tarballs, and release evidence must agree on one exact candidate
and `1.1.1` version policy. A roster addition, removal, rename, private/public classification
change, or partial registry observation invalidates prior evidence.

### D3. One-time governed rebaseline

`1.1.1` is a one-time governed rebaseline, not a normal Changesets projection. Starting from
`0.5.0`, a normal single Changesets bump cannot deterministically produce the exact Owner-selected
`1.1.1` fixed-group version.

Engineer implementation must replace the old hard-coded `unifiedRebaselineVersion = '0.5.0'`
exception with a narrowly governed `1.1.1` rebaseline contract. Preparation must be deterministic
and script-driven; it must not hand-edit generated evidence. The expected preparation interface is:

```sh
node scripts/prepare-unified-rebaseline.mjs --target 1.1.1 --write
```

The command must update exactly the 38 package manifests and changelogs, the root manifest,
internal published STYNX ranges, the create-app template, and SBOM inputs or outputs declared by
release policy. A `--check --target 1.1.1` mode must prove byte-stable reruns. The version commit
subject remains `ci: version packages`, and the existing exact-base/follow-up path restrictions
remain fail-closed.

After this one-time candidate, ordinary releases return to the normal Changesets fixed-group flow.

### D4. Registry monotonicity with one exact anomaly

A naïve global rule requiring the candidate to exceed every historical version would wrongly make
the erroneous `angular-profile@2.0.0` publication authoritative. Registry validation instead must:

1. require candidate `1.1.1` for every package;
2. require `1.1.1` to exceed every legitimate historical `1.x` version;
3. reject any unadjudicated version above the candidate; and
4. permit only the exact anomaly recorded in
   `law/policy/registry-version-anomalies.json`.

The exception is package- and version-specific. It cannot apply to another package, another
version, a future candidate, or a missing/modified policy record.

The required registry-check interface is:

```sh
node scripts/verify-release-policy.mjs --registry-monotonicity --candidate 1.1.1
```

Missing authentication, partial census, timeouts, malformed metadata, candidate presence, roster
drift, or unknown anomalies fail closed.

### D5. Exact-main and exact-tree publication

Version preparation, publication, deprecation, deletion, and dist-tag mutation are separate
authorization boundaries. Publication requires an exact 40-character `main` commit named by the
Owner after merge and after exact-main gates pass. The checked-out commit and current
`origin/main` must equal the authorized commit. All 38 artifacts must be built from that exact
tree; a partial publish is not a unified release and requires recovery before any success claim.

### D6. Consumer migration

- Consumers on a valid `^1` range may select `1.1.1` without crossing a major boundary.
- Consumers on `^0.5.0` must change their manifests to `^1.1.1`.
- `angular-profile` consumers on erroneous `^2` ranges must change to `^1.1.1`.
- Deprecation text and release notes must state that `2.0.0` was an incorrect major assignment;
  they must not imply that SemVer automatically moves `^2` consumers back to `1.x`.

### D7. Angular-profile remediation

The selected remediation is **deprecate, do not delete**:

1. First publish and verify unified `1.1.1` under separate Owner authorization.
2. Then, under a second exact Owner authorization, deprecate only
   `@stynx-nyx/angular-profile@2.0.0` with a message directing consumers to `^1.1.1`.
3. Retain the immutable tarball and version record as recoverable historical evidence.

This is the least destructive option that makes the correction explicit. Retaining `2.0.0`
without a deprecation marker is too ambiguous. Deletion is not recommended because it removes
consumer-visible history, the API did not expose download counts, and the Owner has not authorized
it. Deletion remains possible only through a new Owner decision naming version ID `1024692931`,
after durable recovery evidence and current deletion/restoration eligibility are positively
demonstrated.

### D8. Dist-tags

Successful publication should make `1.1.1` the `latest` dist-tag through the normal release flow.
Post-publication verification must prove this for all 38 packages. Any explicit `npm dist-tag`
repair is a separate Owner-authorized mutation; it is never inferred from publication authority.

## Stop conditions

Stop without mutation or readiness claim if any of the following occurs:

- `1.1.1` appears in any package before the authorized publication;
- the publishable roster is not exactly and deterministically reconciled;
- registry authentication or any package query fails;
- the anomaly policy is missing, modified without Architect authority, or matches more than the
  one exact package/version;
- the candidate is not an exact clean tree or is not current exact `main` at publication time;
- any manifest, internal range, changelog, template, SBOM, tarball, or receipt disagrees;
- publication succeeds for fewer than all 38 packages;
- any required gate is skipped, stale, cancelled, timed out, or bound to another SHA/tree; or
- a requested destructive action lacks a separate exact Owner authorization and recovery proof.

## Non-executed runbook 1 — Unified `1.1.1` preparation and publication

Every mutation step below requires its own role-appropriate session. This Architect session does
not execute the runbook.

### Phase 1: read-only entry and census

```sh
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
git worktree list --porcelain
node scripts/verify-release-policy.mjs --registry-monotonicity --candidate 1.1.1
```

Stop unless entry is the authorized clean base, the roster is 38, every query succeeds, and
`1.1.1` is absent everywhere.

### Phase 2: Engineer preparation

```sh
node scripts/prepare-unified-rebaseline.mjs --target 1.1.1 --write
node scripts/prepare-unified-rebaseline.mjs --target 1.1.1 --check
pnpm security:sbom
pnpm release:policy
pnpm release:provenance
pnpm release:consumer-fixtures
git diff --check
```

The Engineer must reconcile the exact changed-file set with D3, commit with subject
`ci: version packages`, and open a PR only under separate authorization. The PR must preserve the
exact-base and narrow-follow-up rules in `scripts/lib/release-context.mjs`.

### Phase 3: candidate gates

Run the repository's full required pre-merge and trusted local RC gates. Record exact SHA, tree,
inputs, outputs, workflow runs, and receipts. A timeout, cancellation, missing job, superseded run,
or composite result is not a pass.

### Phase 4: exact-main authorization

After the candidate is merged by a separately authorized role, revalidate exact `main`, rerun the
complete registry census, and obtain a new Owner publication authorization naming the full commit.
The publication command is then:

```sh
candidate_sha='<authorized 40-character exact-main SHA>'
gh workflow run release.yml --ref main -f candidate_sha="$candidate_sha" -f publish=true
```

This command is forbidden until the repository opt-in, protected token, exact-main equality, full
gates, and explicit publication authorization are all present.

### Phase 5: post-publication verification

For each deterministically discovered package, verify:

```sh
npm view '<package>@1.1.1' version dist.integrity dist.shasum --json \
  --registry=https://npm.pkg.github.com
npm view '<package>' dist-tags --json --registry=https://npm.pkg.github.com
```

Reconcile all 38 registry artifacts with the candidate tarballs, manifests, internal ranges,
integrities, exact tree, Git tags/releases, and publication receipt. Report `NOT READY` if any
package or tag differs.

## Non-executed runbook 2 — Angular-profile `2.0.0` correction

This runbook begins only after unified `1.1.1` is fully verified and after a new Owner
authorization names the exact package, version, action, and message.

### Recommended deprecation

```sh
npm view '@stynx-nyx/angular-profile@2.0.0' \
  version dist.integrity dist.shasum deprecated --json \
  --registry=https://npm.pkg.github.com
npm deprecate '@stynx-nyx/angular-profile@2.0.0' \
  'Incorrect major version; migrate to @stynx-nyx/angular-profile@^1.1.1.' \
  --registry=https://npm.pkg.github.com
npm view '@stynx-nyx/angular-profile@2.0.0' deprecated --json \
  --registry=https://npm.pkg.github.com
npm view '@stynx-nyx/angular-profile' dist-tags --json \
  --registry=https://npm.pkg.github.com
```

The expected result is a deprecation marker on exactly `2.0.0` and `latest=1.1.1`. Any explicit
dist-tag repair requires another Owner authorization.

### Non-recommended deletion alternative

Before any deletion, re-download and hash the tarball, record version ID `1024692931`, current
visibility, download-count evidence or its absence, consumers, package permissions, and confirmed
restoration eligibility. Only an Owner authorization that names that exact ID may permit:

```sh
gh api --method DELETE \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  /orgs/stynx-nyx/packages/npm/angular-profile/versions/1024692931
```

Deletion is not part of the selected plan and must not be executed from this ADR.

## Consequences

- STYNX retains the intended `1.x` compatibility line and uses a collision-free unified `1.1.1`.
- Valid `^1` consumers have an automatic SemVer path; `^0.5` and erroneous `^2` consumers need
  explicit manifest changes.
- One exact anomaly is visible without allowing arbitrary registry-history bypasses.
- A one-time rebaseline needs Engineer tooling and Inspector sensor coverage before publication is
  ready.
- Registry history is preserved; correction is communicated through deprecation rather than
  deletion.
- Until the Engineer implementation, complete gates, exact-main publication authorization, and
  post-publication reconciliation exist, the release verdict is `NOT READY`.
