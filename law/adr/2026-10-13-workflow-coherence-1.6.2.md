---
adr_id: ADR-DEVAI-ADOPTION-0023
title: Prospective 1.6.2 authored-workflow coherence
status: accepted
date: 2026-10-13
authors: ['Architect']
tags: [devai, workflows, audit, concurrency]
---

# ADR-DEVAI-ADOPTION-0023 — Authored-workflow coherence

The 1.6.1 exact-candidate observation reports three action-version drifts and
eleven concurrency-policy findings in F5:T3. This amendment aligns the
Architect-authored checkout and setup-node actions with the already-generated
DEVAI workflow pins. It changes no action input, job permission, condition,
required gate, test, threshold or release trigger. The DEVAI-generated
workflows remain package-owned; their upload-artifact v4 pin must be updated
through a published DEVAI package and registered upgrade, never by a direct edit.

Hardening and both release-prep workflows serialize runs on the same ref without
cancelling an active run. The read-only reusable typecheck supersedes an older
run on the same ref using a group distinct from its caller. Existing
ref-scoped CI, docs, demo, reference and semantic-title concurrency remains
unchanged. A release publication continues to serialize.

The installed sensor conservatively reports many job effects unknown. Its
supported reviewed-step policy accepts only complete, canonical step and
executable/import closures. This amendment grants no blanket effect override:
an unsupported composite action, shell form, computed import or missing file
keeps its job unknown and F5:T3 non-PASS. Likewise, F5:T4's 13 gate invariants
need actual fail-closed CI producers and fresh successful exact-candidate
evidence; declaration alone earns no alignment. These unresolved findings
remain visible at the 1.6.2 cutoff and continue into 1.6.3 if not proved.

Each workflow-file commit requires the Owner's `FORBID-CI-WITHOUT-ADR` receipt
for its exact SHA before protected push. The ordinary workflow references and
CI release gates remain mandatory. No k6 or mutation run is introduced by
this amendment.
