# STYNX-maintained HTTP cache semantics security fork

This private package is `http-cache-semantics@4.3.1-stynx.1`, derived from upstream
4.3.0. The precise root `http-cache-semantics@4` override must resolve to this
actual local source. It preserves the upstream [BSD-2-Clause license](LICENSE),
copyright and CommonJS API. [provenance.json](provenance.json) records raw input
file digests; committed changes and final independent review identify patched
bytes. The suffix denotes a maintained STYNX fork, not an upstream release.

Independent installed-4.3.0 tests reproduced unsafe reuse with request max-stale
for shared private, response no-cache and stale proxy-revalidate cases. Preserve
those failed expectations and their measured outputs. Neither the
[advisory's range](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) nor the
[maintainer dispute](https://github.com/github/advisory-database/issues/10139)
turns an observed failure into a fix. A clean scanner result is separate evidence.

## Maintained behavior

A shared reuse-admission guard runs before max-stale and stale-while-revalidate
reuse, and is required by stale-if-error helpers. Uncacheable responses and
response no-cache cannot bypass validation. Preserve the existing conservative
must-revalidate handling. Shared stale proxy-revalidate/s-maxage cannot bypass
validation through stale extensions. Stale-if-error additionally requires the
incoming request to match the stored resource/representation.

These are confined admission checks under
[RFC 9111](https://httpwg.org/specs/rfc9111.html#serving.stale.responses).
Preserve upstream request matching, Vary/authorization checks, header handling,
valid fresh/private cache behavior and successful revalidation. The package is
a policy library, not a cache store or tenant-identity service; consumer cache
keys and storage remain consumer responsibilities. Do not claim all HTTP cache
behavior is independently proven from these focused guards.

## Maintenance and acceptance

[ADR-SECURITY-FORK-0001](../../law/adr/2026-10-10-maintained-braces-security-fork.md)
assigns Engineer source maintenance, Inspector independent installed behavior
regressions and Auditor independent review. Acceptance remains pending until
actual source hashes, execution and review are recorded. Required regressions
retain private/no-cache/no-store, max-stale, shared proxy-revalidate/s-maxage,
stale-while-revalidate/stale-if-error, mismatch, Set-Cookie/Vary and legitimate
fresh/private/revalidated cases. Do not change failed expectations to fit code.

Retain upstream license/provenance and inspect each source diff. Run actual
cache consumer loading/tooling, frozen installation and unchanged full/production
audit, SBOM/license/security and normal release gates. Do not suppress advisories
or replace measured remediation with a version rename. Report concerns privately
to STYNX maintainers using private security reporting when available.

Remove this fork only after a supported upstream release demonstrates equivalent
admission safety and passes the retained independent regressions. Preserve the
fork's provenance, failures and review history when replacing it.
