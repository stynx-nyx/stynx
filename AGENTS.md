# STYNX agent guide

STYNX adopts the published `@aarusso-nyx/devai` 1.4.5 package at tier 1. Read
the repository authority sources in this order before making changes:

1. `README.md`
2. `law/constitution.md` and its pinned source at `.devai/pin/constitution.md`
3. `law/adr`
4. `law/schemas`
5. `docs/meta/development-contract.md`

Constitution Article 6 assigns authority by path. Declare exactly one current
human role for governed work: Owner, Architect, Inspector, Engineer, or
Auditor. A role declaration does not broaden the user's requested scope.

Work only within that scope, preserve unrelated user changes, and verify
changes in proportion to their risk. Never weaken or delete tests to make a
change pass. Use Conventional Commit subjects.

For STYNX-specific boundaries, tenancy and RLS requirements, database change
obligations, generated tooling, and release-state references, the development
contract remains authoritative.
