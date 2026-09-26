# Cross-family delivery-review, cycle 5 — STYNX 1.5 CTG-0001

You are **Claude Code Opus 5.5**, an independent read-only reviewer. Review
the complete STYNX diff from `75b9966a887192121a3904fef7cfd211f8e94465`
to the current HEAD of this worktree. Prior verdicts are in
`work/rounds/R-0002/reviews/ctg-0001-delivery-review-{1,2,3,4}.json`.
Resolve every cycle-4 finding individually against the current contract,
tests, source, trace, API baseline, and all prior findings. The read-only
DETRAN specification is
`/Users/aarusso/Development/detran/work/campaigns/C-0002-stynx-upstream-spec.md`
§§3, 7, 8. OD-S15-01 makes UPS-TEN-01…06 MUST, requires middleware option
(b), and rejects Host/header conflicts. Do not edit files, mutate Git,
publish packages, or write in DETRAN.

Cycle-4 repairs to examine:

1. The Architect clarified `docs/framework/contracts/tenancy-context-1.5.md`:
   a usable JWKS set from a successful forced refresh in the 30-second
   suppression window can definitively reject another invalid signature.
   A stale set or failed refresh must still fail closed as source ambiguity.
2. The Inspector changed the real signed RSA/JOSE suppression test to expect
   `InvalidCredentialError` for the just-refreshed set; added failed refresh
   and suppressed retry as non-typed failures; added a remote `jwksUri`
   forced-refresh failure with exactly two fetches and `fetch` restoration;
   added HTTP 500 on `/auth-public/optional` for STYNX JWKS outage; and
   covered the remaining Cognito definitive JOSE codes.
3. The Engineer recorded the forced-refresh start on `CachedKeySet` and
   classifies a miss against that successful set as typed invalid. It keeps
   a more recent forced-refreshed cache from a concurrent validation as a
   fast path even if 30 seconds elapsed; stale/non-forced sets and refresh
   failures remain non-typed. Check concurrent and time-window behavior,
   including the trust boundary when the signing source is unavailable.
4. The Architect rebound `law/trace.json` to 393/393; baseline regeneration
   produced no diff. Commits remain role separated: Inspector tests
   `57288b8d`, Architect trace `d840448d`, Engineer source `e4253237`.

Evidence at code HEAD `e4253237106d29b54b8e3dbd1f27721d2e08467d`:
full local `STYNX_TEST_PG_HOST=127.0.0.1 STYNX_TEST_PG_PORT=55432
STYNX_TEST_PG_USER=postgres STYNX_TEST_PG_PASSWORD=postgres pnpm ci:stynx`
passed; log `/private/tmp/stynx-s15-ctg1-ci-review5.log`: trace 393/393,
RLS negative and smoke, API baseline 44/44, auth 234/234, tenancy real
PostgreSQL 39/39, 97/97 test tasks, 51/51 integration tasks, 48/48 build
tasks. `pnpm package-readmes:write` changed zero files; `pnpm
release:preview` projects fixed group 1.4.0→1.5.0 minor; DEVAI
forbidden-actions check returned no findings.

Re-check all previous delivery-review findings and any new trust-boundary or
regression issue. Confirm no weakened tests, no DETRAN code copy, no
unauthorized workflow or publication action. A green gate alone is not
proof. Return **only one valid JSON object**:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS means CTG-0001 can open a PR and merge after remote CI. REVIEW means
specific repairable gaps remain. FAIL means an irreconcilable policy or
contract issue. Cite file paths and source facts. No Markdown fences.
