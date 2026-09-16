# STYNX 1.4.0 — DEVAI 1.5.0 adoption census

## Scope

This migration adopts the exact published `@aarusso-nyx/devai@1.5.0`, binds
Constitution 1.0.1, advances the release verification profile to 1.4.0, and
prepares the 44-package fixed group for STYNX 1.4.0.

It changes governance, task selection, generated bindings, tests, and release
metadata only. Public APIs, runtime code, DDL, and database migrations are out
of scope.

## Entry census

| Surface              | Entry state                                   | Required outcome                                                                 |
| -------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| DEVAI dependency     | exact 1.4.5                                   | exact registry package 1.5.0                                                     |
| Constitution pin     | 1.0.0                                         | 1.0.1, digest `ff8c4f099a284b1b42f980742b20c849379ba4e3f357905f36a87648ae3fdeae` |
| Release profile      | schema/policy 1.0.0, 38-entry mutation roster | schema/policy 1.4.0, empty mutation roster, no mutation execution                |
| STYNX fixed group    | 44 packages at 1.3.1                          | one minor changeset previewing 44 packages at 1.4.0                              |
| Mutation command     | `pnpm test:mutation`                          | preserved as manual hardening                                                    |
| Stryker population   | 38 configurations/targets                     | preserved byte-for-byte except for unrelated generated metadata                  |
| Mandatory task graph | `release:prepare` reaches `test:mutation`     | no mandatory profile or workflow reaches mutation                                |
| Functional tests     | governed corpus                               | no removal or weakening                                                          |

## Package identity

| Field             | DEVAI 1.5.0 identity                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Registry tarball  | `https://npm.pkg.github.com/download/@aarusso-nyx/devai/1.5.0/f87a6e78976f6844a6bf4f281d7e4e72df49f31b` |
| npm integrity     | `sha512-xJoiua6Q4omdQt6adrcTpc8K2YXyGRkNnbvF6ePFghHfLsXnaGuUS/lxsNqTp1d+N+13M9rg6DQhbIUAnDhUYA==`       |
| Tarball SHA-256   | `c431c4de9a4e37f11cff8a11894e3fe3f9242383c57f84fad1bdb99c373be25b`                                      |
| Source commit     | `8912735a670d20263f842f3f6f0bf575cc71081b`                                                              |
| Source tree       | `9764d36707368bbe3f7a8e0417af5d40901c6220`                                                              |
| Signed tag object | `037e426917daed66c2bff8604c3d56906ea00fef`                                                              |

## Exit evidence

The migration is ready for PR review only when frozen installation, Doctor,
binding validation, ordinary test gates, workflow/DAG reachability sensors, and
`pnpm release:preview` are green on the same candidate. Mutation itself is not
executed for acceptance. Publication requires a later Owner authorization that
names the exact candidate SHA and opts in with `publish: true`.
