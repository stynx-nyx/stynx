# PORT-02 — Is STYNX Right for You

**Produces:** `docs/stynx/porting-pack/02-IS-STYNX-RIGHT-FOR-YOU.md`.
**Depends on:** `01-WHAT-IS-STYNX.md`.
**Branch:** `docs/stynx/porting-pack/02-fit`.

## Mission

A consuming agent must be able to evaluate, on behalf of its
operators, whether porting onto STYNX is appropriate. This file
gives that evaluation a structured form.

## Structure

````
# 02 — Is STYNX Right for You

## Strong fit when

- Multi-tenant SaaS with shared-DB tenancy (or migrating to it).
- TypeScript + NestJS already in use, or team comfortable with adopting.
- Postgres-compatible DB.
- AWS deployment target.
- Need for built-in LGPD/GDPR-style data subject pipelines.
- Soft-delete with auditable restore is a product requirement.
- (Add 1–2 more from `01-WHAT-IS-STYNX.md` if grounded.)

## Poor fit when

- Single-tenant app — STYNX's tenancy invariants add cost without value.
- Non-Postgres database — RLS and the trigger audit are PG-specific.
- Non-NestJS backend you cannot replace — STYNX guards/decorators are NestJS-shaped.
- Strict relationship-based authz needs (ReBAC, Zanzibar-style) — STYNX is RBAC only.
- Targeting non-AWS cloud — STYNX's spec assumes AWS primitives.
- Native mobile-only frontend — no native shell support in v1.0.
- (Add 1–2 more if grounded.)

## Compatibility check (10 yes/no questions)

The agent runs each against the foreign codebase and records the answer.

1. Is the backend already TypeScript or migratable to TS within scope?
2. Is the backend NestJS, or replaceable with NestJS?
3. Is the database PostgreSQL (any version supporting RLS)?
4. Is the deployment target AWS, or migratable?
5. Are tenants currently expressed as a column on most domain tables (vs schema-per-tenant or DB-per-tenant)?
6. Is identity already federated to Cognito, or is the team willing to adopt Cognito?
7. Is the existing soft-delete (if any) implemented with `deleted_at` on live tables (the audit-anti-pattern STYNX rejects)?
8. Is the frontend Angular, or is the team willing to either (a) migrate or (b) consume `@stynx-web/sdk` from a non-Angular client?
9. Is the team prepared to adopt strict CI gates (commitlint, doctor, migration linter, branch protection)?
10. Is there an LGPD/GDPR data subject requirement that justifies the privacy pipeline cost?

Scoring:
- 8–10 yes → STRONG FIT
- 5–7 yes → SCOPE-REDUCED FIT (port only the layers that match)
- 0–4 yes → DO NOT ADOPT

## Decision tree (Mermaid)

```mermaid
flowchart TD
  A[Start] --&gt; B&#123;TS + NestJS feasible?&#125;
  B -- no --&gt; Z[DO NOT ADOPT]
  B -- yes --&gt; C&#123;Postgres + AWS feasible?&#125;
  C -- no --&gt; Z
  C -- yes --&gt; D&#123;Multi-tenant?&#125;
  D -- single-tenant --&gt; Y[SCOPE-REDUCED:&lt;br/&gt;skip @stynx-nyx/tenancy&lt;br/&gt;and RLS layer]
  D -- multi-tenant --&gt; E&#123;LGPD/GDPR&lt;br/&gt;needed?&#125;
  E -- no --&gt; Y2[SCOPE-REDUCED:&lt;br/&gt;skip @stynx-nyx/privacy]
  E -- yes --&gt; F&#123;Frontend Angular&lt;br/&gt;or sdk-only?&#125;
  F -- neither --&gt; Y3[SCOPE-REDUCED:&lt;br/&gt;backend port only,&lt;br/&gt;keep foreign FE]
  F -- ok --&gt; P[PROCEED]
````

```

## Rules

- Be honest about poor-fit cases. The pack must protect operators
  from a wrong adoption.
- Decision-tree leaves end in actionable verdicts, never in
  "consult the team".

## Acceptance

- Strong-fit and poor-fit lists each have ≥5 entries.
- Compatibility checklist has exactly 10 questions.
- Mermaid renders (mental check: brackets balanced, edges named).
```
