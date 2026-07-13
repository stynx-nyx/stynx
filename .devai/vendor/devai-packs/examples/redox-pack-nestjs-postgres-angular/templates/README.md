# NestJS + Postgres + Angular — Scaffolder templates

This directory hosts the per-stack template tree consumed by Phase 18.F's
deterministic `SKILL-scaffold-*` family. Templates are token-bearing
files (`__NAMESPACE__`, `__MODULE__`, `__kebabEntity__`, ...) rendered
into concrete output by the engine at `packages/core/src/templates/`.

## Forensic origin (D-59)

All templates below were absorbed from
`/Users/aarusso/Development/tools/codex/doit/TEMPLATES/` in Phase 18.G
(`CODEX-<origin>` provenance). The codex source repo was deleted at
Phase 18.K close (D-60); this README is the surviving citation.

| Pack template                                       | Codex source                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `db/migration.sql.tpl`                              | `TEMPLATES/db/migration.sql`                                               |
| `db/seed.sql.tpl`                                   | `TEMPLATES/db/seed.sql`                                                    |
| `api/__kebabModule__.module.ts.tpl`                 | `TEMPLATES/nest/__kebabModule__/__kebabModule__.module.ts`                 |
| `api/controllers/__kebabEntity__.controller.ts.tpl` | `TEMPLATES/nest/__kebabModule__/controllers/__kebabEntity__.controller.ts` |
| `api/services/__kebabEntity__.service.ts.tpl`       | `TEMPLATES/nest/__kebabModule__/services/__kebabEntity__.service.ts`       |
| `api/dto/create-__kebabEntity__.dto.ts.tpl`         | `TEMPLATES/nest/__kebabModule__/dto/create-__kebabEntity__.dto.ts`         |
| `api/dto/update-__kebabEntity__.dto.ts.tpl`         | `TEMPLATES/nest/__kebabModule__/dto/update-__kebabEntity__.dto.ts`         |
| `api/decorators/policy.decorator.ts.tpl`            | `TEMPLATES/nest/__kebabModule__/decorators/policy.decorator.ts`            |
| `api/guards/policy.guard.ts.tpl`                    | `TEMPLATES/nest/__kebabModule__/guards/policy.guard.ts`                    |
| `api/guards/__kebabModule__-rbac.guard.ts.tpl`      | `TEMPLATES/nest/__kebabModule__/guards/__kebabModule__-rbac.guard.ts`      |
| `api/entities/__kebabEntity__.entity.ts.tpl`        | `TEMPLATES/nest/__kebabModule__/entities/__kebabEntity__.entity.ts`        |
| `ui/__kebabModule__.module.ts.tpl`                  | `TEMPLATES/angular/__kebabModule__/__kebabModule__.module.ts`              |
| `ui/__kebabEntity__-list.component.ts.tpl`          | `TEMPLATES/angular/__kebabModule__/__kebabEntity__-list.component.ts`      |
| `ui/__kebabEntity__-detail.component.ts.tpl`        | `TEMPLATES/angular/__kebabModule__/__kebabEntity__-detail.component.ts`    |
| `ui/__kebabEntity__.service.ts.tpl`                 | `TEMPLATES/angular/__kebabModule__/__kebabEntity__.service.ts`             |
| `ui/policy.guard.ts.tpl`                            | `TEMPLATES/angular/__kebabModule__/policy.guard.ts`                        |
| `ui/guards/cognito.guard.ts.tpl`                    | `TEMPLATES/angular/__kebabModule__/guards/cognito.guard.ts`                |
| `tests/__kebabEntity__.controller.spec.ts.tpl`      | `TEMPLATES/nest/__kebabModule__/__kebabEntity__.controller.spec.ts`        |
| `tests/__kebabEntity__.service.spec.ts.tpl`         | `TEMPLATES/angular/__kebabModule__/__kebabEntity__.service.spec.ts`        |
| `docs/ADR-0001.md.tpl`                              | `TEMPLATES/docs/ADR.md`                                                    |
| `docs/README.md.tpl`                                | derived (NestJS+Angular-specific)                                          |
| `ci/module-workflow.yml.tpl`                        | derived from `CI_POLICY.md`                                                |

## Token set

The 12 canonical tokens (per `packages/core/src/templates/index.ts`):
`__NAMESPACE__`, `__MODULE__`, `__kebabModule__`, `__snake_module__`,
`__moduleSlug__`, `__ENTITY__`, `__classEntity__`, `__kebabEntity__`,
`__snake_entity__`, `__snake_table__`, `__SPEC_VERSION__`,
`__SPEC_SHA__`.

## Conditional blocks

`<!-- IF:flagName -->...<!-- ENDIF:flagName -->`; not currently used in
the codex source but supported by the engine for future template
elaborations.
