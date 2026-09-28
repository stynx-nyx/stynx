# CTG9 OFS delivery-review 3 — bridge format failure

The DETRAN Claude bridge ran `claude-opus-5-5` against prompt 178 and the
explicit STYNX worktree. It exited 4 because Claude enclosed one JSON object
in a Markdown `json` fence, which the bridge requires to be bare JSON. The
output itself reported **FAIL**. Its blocking finding was the `55P03`
batch-lock fallback in `postgres-durable.ts`, which reread an existing batch
without rechecking context hash, sequence and transport fingerprint before
replay or lease takeover. This could replay the wrong batch or apply undeclared
items. Nonblocking findings concerned reconcile after close, noninteger
reserved numbers, legacy duplicate count, in-memory parity and PostgreSQL
lease/concurrency coverage. A direct `claude -p` invocation with the same
prompt and a structured JSON schema was requested to preserve the verdict.
