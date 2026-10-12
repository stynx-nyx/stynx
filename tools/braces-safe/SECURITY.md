# STYNX-maintained braces security fork

This private package is `braces@3.0.4-stynx.1`, a repository-maintained security
fork of upstream 3.0.3. It contains actual structural guards for
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The version suffix identifies STYNX's source; it is not an upstream fixed release.
The precise root `braces@3` override must resolve to this local implementation.

The unchanged [MIT license](LICENSE) and upstream authorship remain.
[provenance.json](provenance.json) records SHA-256 values of raw upstream input
files before STYNX edits/formatting. The committed source diff and final
independent review record identify actual patched bytes. Provenance is not a
claim that the modified files still equal their upstream digests.

## Supported structural behavior

- Fixed `MAX_DEPTH = 128` and `MAX_NODES = 65536` guard AST traversal before
  recursive compile, expand and stringify; parse bounds construction and checks
  its result. Caller-supplied ASTs are included.
- Child and parent cycles, excessive structure and malformed shapes refuse with
  `RangeError('Brace AST exceeds structural safety limits')`.
- Expansion append recursion is depth-guarded. Array flattening is iterative,
  refusing cycles or excessive depth with
  `RangeError('Brace array exceeds structural safety limits')`.
- Options cannot increase/disable structural limits. Results are not silently
  truncated. Existing max-length and range-limit options remain; normal patterns
  retain upstream semantics within these limits.

These checks bound structural recursion, not total Cartesian expansion output,
heap consumption or processing time for every combination of options. The
parser's stack/root/marker accounting may refuse sooner than a textual nesting
count suggests. This is a library for data patterns/ASTs, not a sandbox for
untrusted JavaScript getters/proxies or execution. Callers still control pattern
and expansion admission appropriate to their tool.

## Maintenance and acceptance

[ADR-SECURITY-FORK-0001](../../law/adr/2026-10-10-maintained-braces-security-fork.md)
assigns maintenance to the STYNX repository. Engineer owns the fork and exact
binding; Inspector owns independent installed-package parity, deep/cyclic AST,
array and pattern regressions; Auditor reviews the changed guards independently.
Acceptance records must cite exact patched source hashes and actual execution.
This file records the required contract, not a pre-issued passing review.

For each update, retain upstream license/provenance, inspect the complete source
diff, run bounded adversarial and ordinary glob/range/escape tests and affected
Changesets/lint/docs paths, then the existing frozen-install/audit/SBOM/license
and release gates. A changed identity or clean scanner result is insufficient
without demonstrated source behavior. Do not suppress advisories or remove tools
to claim remediation. Report security concerns privately to STYNX maintainers using private reporting
when available; avoid public exploit details or private input data.

Remove the fork only after a supported upstream release proves equivalent
structural safety and passes the retained compatibility/security regressions.
Preserve provenance and review history when replacing it.
