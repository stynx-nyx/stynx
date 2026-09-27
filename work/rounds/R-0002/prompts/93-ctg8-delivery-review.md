# CTG-0008 cross-family delivery review

Role: **read-only reviewer** from a distinct model family. Review the completed CTG-0008 branch only after Inspector and Engineer checkpoints, focused and full gates. No Git mutation, edits, commits, or publication.

Read the approved contract, invariant/trace, plan, prompts 90–92, changed source/tests, consumer fixture, generated example, and recorded gate output. Check role separation, CTG-0007 topological receipt, strict JSON rejection, path safety and no-overwrite, atomic staging, deterministic manifest/check, public API use from locally packed tarballs without registry access, controller protection, no DETRAN code copy, and real PostgreSQL cross-tenant RLS negative. Verify no test weakening and that failures were triaged. A SQL-text assertion or mock cannot substitute for actual RLS evidence. Verify the changeset and package documentation, API baseline, trace and readiness gates. Treat missing evidence as unknown, never PASS.

Return only one JSON object: `{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}`. PASS only when the delivery is safe for the CTG PR and merge after predecessor gates.
