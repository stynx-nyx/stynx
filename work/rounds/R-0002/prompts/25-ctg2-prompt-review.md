# Cross-family prompt-review — CTG-0002 SSE

You are Claude Code Opus 5.5, independent read-only reviewer. Before
worker dispatch, inspect `work/rounds/R-0002/ctg-0002-plan.md` and
prompts 20–24 and 26, DETRAN C-0002 §4/§7/§8 (read-only), and actual STYNX
backend/data/core/Angular APIs in this worktree. This is exceptional
cycle 3, authorized by the Owner on 2026-09-26 after two REVIEW
verdicts. OD-S15-01 elevates
all SSE/NGSSE/TEST-01 requirements to MUST. The Architect must fix
public API contract before Inspectors; Inspectors prove behavior red;
Engineers implement; only maestro runs Git. No UPS-OBX without adenda.

Find missing requirements, impossible assumptions, role/file locks,
database RLS loopholes, absent real HttpClient bearer/tenant context,
release baseline/readme/trace obligations and test gaps. Check the
cycle-1 repairs: app-supplied sessionActive without an angular-auth
cycle; SSE HttpContextToken preserving 429 Retry-After and allowing
401 refresh/replay; reference/api E2E under its own test:int and
ci:reference-apps, not root test:int; FORCE RLS with a non-superuser
role, no tenant WHERE, and timer ALS cleared or changed. Cycle 2
identified the wrong root test:int gate; the plan now names the real
focused and CI gates, complete role/GUC fixture, secondary entry build,
cumulative partialText ceiling, and trace scope.
Do not edit files, mutate Git, publish or write DETRAN. Return JSON only:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS permits Architect dispatch. REVIEW requires plan/prompt repair;
FAIL escalates. No Markdown fences.
