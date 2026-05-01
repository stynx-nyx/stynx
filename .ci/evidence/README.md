# Local CI Evidence

Local CI evidence is a maintainer-only shortcut for direct `main` pushes. It
does not replace pull request CI, and it is rejected for policy-sensitive
changes such as workflows, branch-protection Terraform, or the evidence scripts
themselves.

The required local jobs for schema v1 are:

- `all-linux`
- `stynx-release`

Generate a manifest after both jobs pass:

```bash
pnpm ci:local -- all-linux
pnpm ci:local -- stynx-release
pnpm evidence:collect \
  --all-linux reports/ci-local/<all-linux-run> \
  --stynx-release reports/ci-local/<stynx-release-run> \
  --output .ci/evidence/local-ci.json
```

Commit the manifest with the trailer that enables evidence mode:

```text
Local-CI-Evidence: .ci/evidence/local-ci.json
```

`evidence/verify` validates the manifest source hash, max age, tool versions,
required job results, allowed platforms, trusted actor policy, and forbidden
file rules. GitHub skip markers such as `[skip ci]` must not be used.
