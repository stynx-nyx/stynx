# Glossary

**Authority:** Owner and Architect, jointly (Constitution Article 6).

This glossary defines terms that recur across stynx package, governance,
architecture, and reference-app documentation.

## DEVAI Terms

- **Substrate** — DEVAI's authority partition for repository artifacts. In
  stynx, architecture/contracts/operations/security docs are Architect
  substrate, packages are Engineer substrate, and tests are Inspector substrate.
- **Invariant** — an atomic architecture rule under
  [../arch/invariants/](../arch/invariants/). Tests and docs
  should reference invariants when they enforce durable framework behavior.
- **Trace** — the mapping from invariants to code, tests, and evidence. Current
  stynx trace lives in `docs/framework/arch/trace.json`.

## Runtime Terms

- **Tenant** — the isolation boundary for data, permissions, sessions, storage,
  audit evidence, and Flow runtime state.
- **Principal** — the authenticated actor context derived from a token, dev auth
  helper, or test session.
- **Permission** — a named capability checked by guards, route metadata, or
  generated RBAC diagnostics.
- **RBAC Matrix** — a generated diagnostic/template for current reference-app
  roles, permissions, routes, and use-case bindings. It is not the canonical
  framework permission catalog; see [ADR-003](../../meta/adr/ADR-003-rbac-matrix-role.md).
- **Curated Table** — a framework-owned live table in schemas such as `auth`,
  `core`, `flow`, `storage`, or `tenancy` that must participate in RLS/tenancy
  and DML audit rules.
- **DML Audit Trigger** — database trigger that writes row mutation evidence to
  the audit subsystem for curated tables.

## Package Terms

- **Backend package** — an installable `@stynx-nyx/*` package under `packages/`
  that exposes NestJS modules, services, adapters, contracts, CLIs, or testing
  utilities.
- **Web package** — an installable `@stynx-web/*` package under
  `packages-web/` for Angular and browser consumers.
- **Reference app** — the demonstrator host applications under `reference/api`
  and `reference/web`.

## Flow Terms

- **Flow graph** — tenant-local workflow definition containing nodes, edges,
  rules, policies, and effects.
- **Run** — an execution instance of a Flow graph.
- **Signal** — an event or fact-change notification that can advance auto nodes
  or runtime state.
- **Fill** — a form-answer container used by Flow form rules and
  PORM-compatible migration aliases.
- **Waiver** — an explicit question-level or fill-level bypass recorded as part
  of a Flow form decision.

## Infrastructure Terms

- **ComputeStack** — regional CDK stack that owns ECS/Fargate, ALB, regional
  WAF, and ALB certificate wiring.
- **EdgeStack** — `us-east-1` CDK stack that owns CloudFront, WAFv2 global rules,
  the CloudFront ACM certificate, and Route 53 A/AAAA aliases.
