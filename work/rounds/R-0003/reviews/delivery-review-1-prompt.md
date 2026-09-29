# STYNX R-0003 independent delivery review

You are the cross-family Claude Code Opus 5.5 reviewer. Read only. Return a single valid JSON object with keys `verdict` (`PASS`, `REVIEW`, or `FAIL`), `findings` (array of objects with `severity`, `file`, `line`, `problem`, `required_fix`), and `evidence` (array of strings). No Markdown fences or prose outside JSON.

Review the current worktree diff from `origin/main` through HEAD for the post-1.5.0 follow-up. Read AGENTS.md, README.md, law/constitution.md and pin, applicable ADRs, law/schemas, docs/meta/development-contract.md, and R-0003 plan. The Owner asked to execute remaining STYNX/prior campaign debts but excludes all DETRAN consumer proofs and DETRAN writes. Distinguish required blockers from optional improvements. Do not run Git mutations or change files.

Focus on:

1. #306: `OutboxService.dispatchTenantEventsDue` and `ackTenantEvent`, migration 0022, two-tenant real PostgreSQL tests. Check the actual SQL role, tenant and actor provenance, RLS, cross-tenant isolation, ACK/HMAC order, attempt/projection atomicity, retries/reconciliation, and compatibility with legacy owner scheduler.
2. CTG5 `deadlineMs` option and statement-timeout rollback, including audit trigger waiting during idempotency reservation and preservation of existing 504 body.
3. SIG fixtures/classification for authentic unsupported xref and hostile PDF evidence; PKI revoked intermediate, delegated OCSP without EKU, TSA validity. No weakened attack tests.
4. Dependency override and lockfile fixes, changeset fixed group, API baseline and trace rebind, package readmes, migration upgrade test, local pilot fixes, coverage config.
5. Any violations of role-separated commits or generated-file/DDL obligations, or material security regressions.

Do not require DETRAN proofs. Do not assume unpublished 1.5.1 behavior is already in registry. The local CI is running on this exact tree; report code findings independently of its result. Cite precise file and line for each finding. A `REVIEW` means fixable issue; `FAIL` means a fundamental conflict with authority.
