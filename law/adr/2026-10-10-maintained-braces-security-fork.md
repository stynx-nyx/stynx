---
adr_id: ADR-SECURITY-FORK-0001
title: Maintained braces and HTTP cache security forks
status: accepted
date: 2026-10-10
authors: ['Architect']
tags: [security, dependencies, tooling, provenance, release]
---

# ADR-SECURITY-FORK-0001 — Maintained braces and HTTP cache remediation

## Authority and scope

This decision implements the Owner-authorized security remediation in the
[complete 1.6.0 campaign](2026-10-10-minor-release-1.6.0.md). It admits maintained
security code with independent tests/review. It does not certify unfinished
implementation, close an advisory from package metadata alone, waive audits or
authorize a tooling/release-control migration.

`braces@3.0.3` is used by active Changesets, boundary/dependency lint and docs
paths. The current [stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects that upstream version and lists no patched release. Removing those
active tools would remove required controls. The repository already maintains
an analogous [image-size security fork](../../tools/image-size-safe/SECURITY.md).

## Decision

1. **Real maintained source.** Maintain `tools/braces-safe` as private
   `braces@3.0.4-stynx.1`, derived from upstream 3.0.3 under its unchanged MIT
   license/copyright. Use the precise `braces@3` override linking the actual
   local code. The suffix is a STYNX fork identity, not an upstream release or
   a scanner-only rename. Preserve the CommonJS public API and ordinary
   parse/compile/expand/stringify/glob behavior within the safety limits.
2. **Fixed structural refusal.** Hard depth 128 and AST node-visit 65536
   guards precede recursive compile/expand/stringify traversal, including
   caller-supplied ASTs. Parse enforces bounded construction and validates the
   result. Reject child/parent cycles and malformed structural shapes. Expansion
   append recursion has the same fixed depth ceiling; array flattening is
   iterative with cycle/depth checks. Options cannot increase or disable these
   structural guards. Excess structure throws deliberate `RangeError` without
   returning truncated output; it must not reach native stack exhaustion.
3. **Exact resource scope.** Preserve upstream input-length behavior,
   `rangeLimit` (default 1000), its documented options and expansion semantics.
   Structural limits do not claim a total generated-output/CPU/heap budget:
   Cartesian expansion and caller-selected range settings remain relevant.
   Parsed stack/root/marker accounting can refuse at a boundary before a raw
   nesting count reaches 128. Callers must not depend on an exact textual
   nesting allowance or pass untrusted executable JavaScript objects as data.
4. **Provenance and maintenance.** Preserve raw upstream file SHA-256 values
   in `provenance.json`, the exact source diff and actual patched-byte identity
   in committed source and independent review evidence. Update these records
   when the fork changes. Engineer owns source; Inspector owns installed
   package equivalence/adversarial regressions; Auditor reviews independently.
   Do not claim acceptance while those checks are pending. Follow
   [the fork maintenance contract](../../tools/braces-safe/SECURITY.md).
5. **Actual cache remediation.** Installed `http-cache-semantics@4.3.0`
   reproduced unsafe max-stale reuse in independent Inspector tests. Maintain
   private `http-cache-semantics@4.3.1-stynx.1` in
   `tools/http-cache-semantics-safe`, preserving upstream BSD-2-Clause license,
   authorship, raw provenance and unrelated CommonJS/cache behavior. Bind the
   precise `http-cache-semantics@4` override to the real local implementation.
   The [advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) version range
   and [maintainer dispute](https://github.com/github/advisory-database/issues/10139)
   do not supersede measured failures. Upstream's separate
   [Vary/inherited-header change](https://github.com/kornelski/http-cache-semantics/commit/9fb520be70eff3ff502fe965d9c3265ca2c64e26)
   is not evidence that these reuse paths are safe.

   Require an actual reuse-admission guard: uncacheable responses and response
   no-cache cannot be reused without validation, regardless of request
   max-stale. When stale, must-revalidate remains mandatory; shared caches
   additionally honor proxy-revalidate and s-maxage. These prohibitions also
   govern background/stale-if-error shortcuts. Preserve valid fresh and private
   cache behavior, matching/authorization/Vary checks and successful revalidation.
   This follows [RFC 9111 sections 4.2.4 and 5.2.2](https://httpwg.org/specs/rfc9111.html#serving.stale.responses).
   Retain independently failed private/no-cache/proxy-revalidate expectations
   and demonstrate their repair against installed bytes. Do not claim final
   acceptance while source/review/testing remains incomplete.

6. **Stale override correction.** Replace the old `smol-toml@1` override with
   exact 1.9.0, retaining actual TOML parsing/config-tool compatibility checks.
   This repairs a stale dependency constraint; the chosen version alone is
   not acceptance evidence. No tool removal, pnpm major upgrade, advisory
   suppression or weakened test/threshold is part of this decision.

## Acceptance and retirement

Record exact installed resolution and local source hashes, ordinary-pattern
parity and direct AST/cycle/deep-input refusal in bounded child processes. Retain installed cache
regressions for private/no-cache/no-store, max-stale, must/proxy-revalidate,
s-maxage, Set-Cookie, Vary and permitted revalidation/fresh/private behavior.
Exercise actual affected tool loading and behavior, Changesets fixed-group
release-policy fixtures, boundary/dependency lint, docs generation/build/type
checks and normal release gates. Re-run unchanged full and production raw audit,
SBOM/license/security checks after frozen installation; report scanner findings
separately from measured remediation. Do not add exclusions to make the graph
look clean. Architect binds affected manifest/trace/API artifacts only through
the established independent-role sequence.

Retain a concrete independent review of the patched structural paths and
compatibility evidence before declaring either fork remediation accepted. Future
upstream adoption must demonstrate equivalent safeguards and pass these same
regressions before removing the local override. A new upstream version number
alone is insufficient. Preserve the old fork provenance/review history when it
is retired. Security report status never relabels the historical 1.5.7 observation.
