# CTG-0003 Engineer — delivery-review cycle 2 repair

Role: **Engineer**. Dispatch only after Inspector tests in prompt 50 are
committed and red. Read the accepted contract, `ctg-0003-plan.md`,
`reviews/ctg3-delivery-review-2.json` and those tests. Restore the
`AuthorizationGuard` fallback when `ModuleRef.get` throws for absent
evaluator/options tokens, preserving `DefaultPolicyEvaluator` and `{}`
for local `@UseGuards` without the module import. Keep configured local
options and custom evaluator behavior. Change the `SessionService` boot
error to name the atomic method's need for tenant switching and session
policy, including mode `off`. Make focused tests, lint and typecheck pass.
Do not edit tests, law, generated files or DETRAN. Do not run Git, commit,
push, open PR or publish. Root handles commits by role.
