# CTG-0003 Inspector — delivery-review cycle 2 regression sensors

Role: **Inspector**. Work only in the CTG-0003 worktree and only in tests.
Read the accepted contract, `ctg-0003-plan.md` and
`reviews/ctg3-delivery-review-2.json`. Add a Nest E2E case using
`@UseGuards(AuthorizationGuard)` and `@RequirePermissions` **without**
importing `StynxAuthorizationModule.forRoot()`. Prove bootstrap succeeds,
the default evaluator grants a present permission and denies an absent
permission as in 1.4, and no `ModuleRef.get` missing-token exception leaks.
Run it red against current source and report exact failure.

Strengthen the real Redis idle-expiry `revoke-existing` case so its returned
`revokedSessionIds` excludes the expired target SID; do not rely on only
the result SID. Update the two existing custom-store boot-error assertions
to expect a message that names both tenant switching and session policy;
these should be red until Engineer repairs production. Preserve every other
assertion. Do not weaken, delete or skip tests. Do not edit production,
law, baselines, generated files or DETRAN. Do not run Git, commit, push,
open PR or publish. Root handles commits by role.
