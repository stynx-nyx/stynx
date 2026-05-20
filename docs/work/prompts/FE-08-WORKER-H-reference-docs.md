# Prompt — Worker FE-H: Reference App, Starter Template, Per-Package Docs

## Runtime

- **Tier:** default.
- **Claude Code:** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/FE-08-WORKER-H-reference-docs.md)\n\nScope: <workstream-id>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort medium --sandbox workspace-write -- "$(cat docs/work/prompts/FE-08-WORKER-H-reference-docs.md)\n\nScope: <workstream-id>"`

You are a worker for Wave **FE-H — Reference App, Starter, Docs** in the stynx frontend completeness programme.

## Scope

- H.1 — `tools/create-stynx-app/` shell script + template directory.
- H.2 — `reference/web/README.md` reorganisation (showcase posture).
- H.3 — Per-package READMEs across `packages-web/*` (including the new `angular-iam` and `angular-audit`).
- H.4 — `packages-web/README.md` rewrite with architecture diagram + install matrix.
- H.5 — ADR consolidation under `docs/adr/INDEX.md` (or equivalent).
- H.6 — `packages-web/MIGRATING.md` for breaking changes.

## Role (Article 6)

- H.1: **Engineer** (under `tools/`).
- H.2, H.3, H.4: **Engineer** (README files under `reference/` and `packages-web/`).
- H.5, H.6: **Architect** (ADR consolidation + migration notes are decision artifacts).

## Wave success criteria (verbatim from `docs/work/plan/FE-WAVE-H-reference-app-docs.md`)

1. `tools/create-stynx-app/bin.mjs` scaffolds a working Angular 20 app with `provideStynxDefaults(...)` in `< 30 seconds`.
2. `reference/web/README.md` exists and describes the demoed surface.
3. Per-package READMEs exist for all 11 packages + `angular-iam` + `angular-audit`.
4. `packages-web/README.md` is rewritten with the diagram and install matrix.
5. ADRs are consolidated under `docs/adr/INDEX.md`.
6. `packages-web/MIGRATING.md` exists.

## Pre-flight

1. `./docs/work/plan/FE-WAVE-H-reference-app-docs.md`.
2. The closure reports for FE-A through FE-G to inventory the released surface, breaking changes, and ADRs.
3. `./reference/web/` — what `create-stynx-app` should reproduce (minus the dev-auth bypass).
4. `./packages-web/README.md` (current).
5. `./docs/adr/` — existing ADR layout and index.

## Constraints

- `create-stynx-app` is a shell script + template directory. No new framework dependency (no Yeoman, no Plop). Pure `node` + `fs`.
- The template includes a minimal `app.config.ts` calling `provideStynxDefaults(...)` with sensible placeholders (developer fills OIDC / tenancy adapter URLs).
- Each per-package README is one page: install, peer-deps, `provideX` snippet, public surface, see-also. Keep it < 200 lines.
- The architecture diagram is Mermaid (renders in GitHub) — no SVG, no PNG.
- `MIGRATING.md` lists each breaking change with a "before / after" snippet.

## Validation commands

```bash
node tools/create-stynx-app/bin.mjs scratch-test-app
cd scratch-test-app && pnpm install && pnpm build && pnpm test
# clean up
cd .. && rm -rf scratch-test-app
```

```bash
# README sanity
for f in packages-web/*/README.md; do echo "$f"; head -3 "$f"; done
markdownlint packages-web/README.md packages-web/MIGRATING.md
```

## Closure

Append to `docs/work/plan/FE-WAVE-H-report.md`.

## Stop conditions

Stop and ask if:

- The `create-stynx-app` template ships defaults that conflict with the typical OIDC issuer config (e.g., Cognito vs Auth0). Ask the orchestrator whether to provide multiple variants.
- A per-package README would exceed 200 lines because the surface is too large (split into multiple docs).
- A breaking change in `MIGRATING.md` doesn't have a clean migration path (escalate to Architect).
