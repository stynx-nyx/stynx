# FE-05 — Testing Against Completeness Expectations

**Compiled:** 2026-05-19
**Reads:** [../inv/FE-06](../inv/FE-06-test-surface-vs-completeness.md), `coverage/test-evidence.json`, `reference/web/test/e2e/`.
**Format:** identify *where the test surface lies about completeness*, and what the test layout for a complete FE should look like.

## The single biggest test problem

**Coverage is 100 % on packages that are stubs.** A stub component whose only body is `@Component({ template: '<input ngModel>' }) class X {}` is 100 % covered by `expect(X).toBeDefined()`. That is the literal current state of `@stynx-web/angular-profile`, `angular-sessions`, `angular-trash`. The aggregate "98–100 % coverage" cited in `coverage/test-evidence.json` is technically accurate and substantively meaningless for those three packages.

**Implication.** Coverage % cannot be the only gate. We must add at minimum:
- A **completeness checklist** asserting that each package's documented capability is exercised by a TestBed-rendered spec.
- A **Playwright fan-out** that exercises each FE-01 row's user-visible behaviour.
- A **mutation threshold** rebased on TestBed-rendered specs (so survival rate becomes meaningful).

## What good tests look like for each FE vertical

### Auth + Login

- `TestBed` spec for `StynxSessionService` that runs through `tokenAcquired → refresh → expired → forcedLogout` transitions.
- `TestBed` spec for `PermissionGuard` against a `Router.createUrlTree()` matcher with stubbed permissions in the injector.
- Playwright: login (real OIDC against `oidc-fake-server`) → assert toast on success → assert redirect to last-attempted URL.
- Playwright: login → tab-A revokes itself → tab-B receives `unauthorized` on next call → modal prompts re-login.

### Profile

- `TestBed` spec asserting the typed `FormGroup` shape, validators fire on invalid input, submit calls `ProfileService.patch(...)` with the right payload, success toast appears.
- `TestBed` spec for the "unsaved changes" guard.
- Playwright: edit name → save → reload → name persists.
- Playwright: change password handoff opens the OIDC hosted-UI URL.

### Sessions

- `TestBed` spec asserting list rendering, "this device" badge resolution, `revoke` event emission, `revokeOthers` confirm dialog.
- Playwright: list sessions → revoke another tab → other tab fails next API call.

### Users / Roles / Groups admin (after the new package lands)

- `TestBed` spec per component for shape, input handling, action emission.
- Playwright scenarios per CRUD vertical: list, create, edit, disable, role-assign, group-assign, permission-matrix toggle.
- Permission-gated: non-admin user sees no admin nav, hitting the route shows the denial component.

### Permissions

- `TestBed` spec for `*stynxHasPermission` directive — shows / hides under different permission sets.
- Playwright: assign permission via admin UI → another tab's UI updates after refresh.

### i18n

- `TestBed` spec asserting `TranslatePipe` returns the right string for a stubbed catalog; falls back to the key when missing; updates when locale changes.
- `TestBed` spec asserting `Intl`-pipes format dates / numbers per locale.
- Playwright: switch locale → all visible strings change.

### Storage

- `TestBed` spec for `<stynx-document-upload>` driving a stubbed `XhrUploadExecutor`: idle → uploading → progress events → done → error.
- `TestBed` spec for mime / size rejection paths.
- Playwright: select file → upload completes → file appears in document list → download → restore from trash.

### Tenancy

- `TestBed` spec asserting `tenantChanged$` fires on `setTenantId`; subscribers (e.g., a stubbed flow list) refetch.
- Playwright: switch tenant → flow list resets → profile re-fetches.

### Audit

- `TestBed` spec for the audit log component: cursor pagination, filter chips, integrity badge.
- `TestBed` spec for the per-entity history component.
- Playwright: admin creates a user → audit log shows the action → entity-history of that user shows it.

### Workflow UI (Flow)

- `TestBed` spec for the designer: open scope → create graph → add node → save → reload → assert structure.
- `TestBed` spec for the runtime fill: render form → fill answers → submit → assert task closed.
- Playwright: full design + run + monitor scenario.

## Test layout proposal

```
packages-web/<pkg>/test/
  unit/
    <component>.component.spec.ts        # TestBed-rendered, input/output/DOM
    <service>.service.spec.ts            # HTTP mock, signal cache
    <directive>.directive.spec.ts
    <pipe>.pipe.spec.ts
  routing/
    <pkg>-routes.spec.ts                 # provideRouter + navigation
  support/
    test-bed.ts                          # renderComponent<T>(C, { inputs, providers })
    fixtures.ts                          # shared seed objects
```

Drop the per-package `test/e2e/` folder — its content was the misleading smokes.

Playwright stays at `reference/web/test/e2e/` and gains:

```
reference/web/test/e2e/
  fixtures.ts                            # canonical users / tenants
  flows/
    auth.spec.ts                         # login, refresh, expired, forced-logout
    profile.spec.ts                      # view, edit, save, password handoff
    sessions.spec.ts                     # list, revoke, this-device
    iam-users.spec.ts                    # admin: users CRUD + disable
    iam-roles.spec.ts                    # admin: roles CRUD + perm-matrix
    iam-groups.spec.ts                   # admin: groups CRUD + role-assign
    permissions.spec.ts                  # has-permission directive in-page
    i18n.spec.ts                         # locale switch end-to-end
    storage.spec.ts                      # upload, download, trash
    trash.spec.ts                        # restore, hard-delete, retention
    tenancy.spec.ts                      # tenant switch, state reset
    audit.spec.ts                        # log viewer, entity history
    flow-design.spec.ts                  # scope→graph→node→edge→save
    flow-runtime.spec.ts                 # publish→start→fill→complete
    flow-analytics.spec.ts               # open-tasks dashboard refresh
```

Each spec ≤ 5 minutes wall-time. Total Playwright wall-time target: ≤ 20 minutes parallelised, ≤ 60 minutes serial.

## Mutation thresholds (proposed)

| Package                    | Today  | Target |
| -------------------------- | -----: | -----: |
| `@stynx-web/angular`       | 76.54  |  80    |
| `@stynx-web/angular-auth`  |  —     |  75    |
| `@stynx-web/angular-flow`  |  —     |  70    |
| `@stynx-web/angular-i18n`  |  —     |  70    |
| `@stynx-web/angular-profile` |  —   |  70    |
| `@stynx-web/angular-sessions` |  — |  70    |
| `@stynx-web/angular-storage` |  —   |  70    |
| `@stynx-web/angular-tenancy` | 72.73 |  75   |
| `@stynx-web/angular-trash` |  —     |  70    |
| `@stynx-web/angular-ui`    |  —     |  70    |
| `@stynx-web/angular-iam` (new) |  — | 70    |
| `@stynx-web/angular-audit` (new) | — | 70   |
| `@stynx-web/sdk`           | 67.81  |  75    |

These are bottom-of-range; bumps follow once the TestBed migration lands.

## Gate ratchet

- **First.** Add the new tests (TestBed + Playwright); don't gate on them.
- **Second.** Once green for two consecutive CI runs, gate on them (`pnpm test:matrix` strict).
- **Third.** Raise mutation thresholds per the table above; gate strictly.
- **Fourth.** Add `@axe-core/playwright` as a non-blocking report; gate after a stabilisation window.

## Net effect

The test surface today **certifies stub bodies, not capabilities**. The proposal above flips it: gate on capability presence, not coverage %; let coverage % be a side-product of capability-driven tests.

Detail in [../plan/FE-WAVE-G](../plan/FE-WAVE-G-test-fan-out.md).
