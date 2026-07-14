---
---

Migrate DEVAI consumption from 0.4.0 to 0.5.0 (hierarchical CLI, Round 16 /
D-129): pin all five `@devai-nyx/*` packages (cli, core, schemas, and the
newly published sensors + utils) to `^0.5.0`; rewrite every `devai`
invocation in `package.json` scripts, `devai-gates.yml`, and repo scripts to
the canonical hierarchical paths (`--human` → `--format human`); vendor the
root `CONSTITUTION.md` + `constitution.{version,sha256}` pin via
`devai adopt upgrade --constitution --write` (0.2.0 → 0.4.0, closing the
`constitution-binding` doctor failure); set `project.json`'s
`devai_version` to 0.5.0; publish the constitution through the docs IA
allowlist; regenerate the skill catalog (52 skills) from the installed CLI.
`devai doctor --adopter` now passes 10/10.
