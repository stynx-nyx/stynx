# Local CI Evidence

Local CI evidence is a maintainer-only shortcut for direct `main` pushes. It
does not replace pull request CI, and it is rejected for policy-sensitive
changes such as workflows, branch-protection Terraform, or the
`ci_economy.local_evidence` policy declared in `.devai/config/project.json`.

Promoted into the canonical DEVAI framework by D-117; this repo now runs
`devai evidence local collect`/`local verify` (0.5.0 hierarchical CLI)
instead of the repo-local prototype scripts it originated as
(`scripts/evidence/*.mjs`, removed).

The required local jobs (declared in `.devai/config/project.json`) are:

- `all-linux`
- `stynx-release`

Generate a manifest after both jobs pass:

```bash
pnpm ci:local -- all-linux
pnpm ci:local -- stynx-release
devai evidence local collect \
  --job all-linux:reports/ci-local/<all-linux-run> \
  --job stynx-release:reports/ci-local/<stynx-release-run>
```

Commit the manifest with the trailer that enables evidence mode:

```text
Local-CI-Evidence: .ci/evidence/local-ci.json
```

`pnpm evidence:verify` (`devai evidence local verify --mode strict`) validates
the manifest source hash, max age, tool versions, required job results,
allowed platforms, trusted actor policy, and forbidden file rules — the same
checks CI runs in `--mode gate`. GitHub skip markers such as `[skip ci]` must
not be used.

See DEVAI's [`docs/meta/ops/local-evidence-runbook.md`](https://github.com/devai-nyx/devai/blob/main/docs/meta/ops/local-evidence-runbook.md) for the full mechanism.
