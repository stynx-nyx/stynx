# npm security upgrade auditor

This repository-specific procedure inventories npm dependencies, evaluates
published advisories, and proposes a phased upgrade plan. It remains under
`tools/` because its package-manager and compatibility rules are specific to
STYNX.

Read `SKILL.md` for the required analysis. Fresh reports belong at
`docs/meta/security/npm-security-upgrade-report.md` and must distinguish direct
from transitive dependencies, patch/minor from major upgrades, and verified
fixes from recommendations.
