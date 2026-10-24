# DII-1 — Current retrospective disposition of R-0002 delivery and waiver

Date: 2026-10-24. Authority: Architect. Status: recorded engineering disposition; non-closing.

## Authority and identity

This is a current decision under the Owner's consolidated STYNX reconciliation mandate and Constitution Articles 6–7. It records engineering evidence and the existing Owner exception; it grants no new exception. The current register census found no existing DII decision or register. `DII-1` is the first unused supported identity, authored in `law/register/DII-1.md`, a path recognized by the pinned DEVAI 2.6.2 decision resolver. No runtime allocator is required for this role-authored law record; PC identities remain allocated exclusively by the closure verb.

This is not the original decision declaring R-0002, not a backdated approval, and not a closing judgment. Do not insert it as both ends of a phase-closure decision pair. A later justified closing decision must strictly follow a genuine applicable declaring decision in the same namespace; their semantic mapping remains to be reviewed. The existence of this file alone does not establish closure eligibility.

## Historical evidence and its limits

R-0002's goal was delivery of U1–U15 from C-0002 as STYNX 1.5.0, with the subsequently approved CTG9/A1 ten MUST requirements. Preserve the original OD-S15 decisions, plan, reviews, conformance ledger and execution narrative.

The closing section of `work/rounds/R-0002/record.md` records:

- PR308's 17 remote jobs passed at `dc0af306a482f4512c5e5d907097bf559e0e607e`.
- `release:prepare` failed because global 100% coverage was unmet in 14 packages. DEVAI did not issue `verified-local-rc` for that candidate. Neither result is PASS.
- The Owner authorized the exact administrative integration exception under ADR-CI-ECONOMY Decision 8 for PR308, that HEAD and tree `4ba7a31120c5944803adaf5aa95de5ecd2273222`. Integration landed as `c3a1c70d01990d317f559a59c6502f8bff5793ce`, preserving branch protection. The record expressly carried coverage and signed-evidence debt forward to the next release. This decision neither expands that exact exception nor newly permits administrative integration.
- Initial publication run36500042438 failed before registry mutation because same-SHA k6 evidence was missing. Hardening run36501815112 subsequently passed; run36504371593 published STYNX 1.5.0 with 44/44 verified-published receipts binding SHA/tree/integrity/shasum. The historical authenticated registry check matched the 44 checksums and latest tags; publication opt-in was restored to false. These are preserved historical observations, not a new registry check.
- Post-merge generic proof `EV-33f8415a0b1f695d`, nonpromoting observation `EV-0dee45f264f8f1c0`, and chain verification are recorded. They are not a signed RC or downstream equivalence proof.

Primary authority: `law/adr/2026-08-24-ci-economy.md`, Decision 8. Primary evidence: `work/rounds/R-0002/record.md`, section “Encerramento da 1.5.0 (2026-09-28–29)”; `work/rounds/R-0002/plan.md`, final disposition; `work/rounds/R-0002/conformance-1.5.0.md`; `record/proofs/work/generic/R-0002.jsonl`.

## Current judgment

The historical framework delivery and 44-package publication are complete and must not be recreated as implementation backlog merely because the round marker remains active. Historical count44 is not today's 47-package group. Existing publication authority is exhausted historical evidence, not permission to publish again.

The exact integration waiver is a valid historical disposition, not proof that coverage passed, that a signed RC existed, or that the carried debt was later discharged. Later qualified candidates may provide successor evidence only through an explicit population/criterion/SHA mapping. They cannot rewrite the old failed attempt. No such debt-discharge judgment is made here.

The current administrative work is to preserve the original narrative before any supported canonical materialization; bind real declaration/closing decisions with truthful meanings; map original criteria and the exact waiver; and prepare an honest phase record. A failed coverage gate must remain failed if included as that historical result. An unissued signed RC may be recorded as skipped/not issued with the failed prerequisite identified. Neither may be converted to PASS merely to obtain a seal.

Pinned `round close` can record a phase with failed gates only when each is explicitly acknowledged by a failing criterion. `round seal` independently requires every declared gate PASS and no failing criterion. This decision does not change either rule, declare a new reduced gate population, or authorize sealing through a failed criterion. No close, declaration, seal, state normalization, new receipt or generated-index installation is executed by this document.

A future current reconciliation work unit may be genuinely declared now and later judged against its own explicit administrative criteria. Its decisions and any supported phase record must identify that current work unit and preserve its relation to R-0002; they cannot be substituted for an unknown original declaration or used to imply the historical round was green. No such new unit, declaration or ordered pair is created here. Keeping an accurately documented historical round unsealed is an allowed reconciliation outcome while real evidence or compatibility gaps remain.

## Supported generated-index sequence

The official DEVAI 2.6.2 evidence-render reference cites Article 6 and prescribes rendering into `.devai/state/render/rounds.md`, followed by a reviewed exact-byte copy into `record/derived/indexes/rounds.md`. This is materialization of generated bytes, not human-authored derived content. Once reviewed closure records exist, preserve the staged digest, compare copied bytes, run `evidence render --kind rounds --check`, and review the generated commit. No extra installer or new Owner decision is needed. Do not author index rows or change them to admit a seal.

## Other rounds and acceptance boundaries

Current R1 and R3 evidence dispositions may be prepared next under Architect authority without normalizing their state. R1 must distinguish resolved RGR0002 and successful successor TASK-0002 from escalated TASK-0001, and retain missing original lock/replay/chain evidence. R3 may recognize recovered PR314 RC, integration, Owner222–225 dispositions and published1.5.3 successor while retaining its remaining eight-scope mapping, PORM PF06 and invalid canonical authorization boundary. Neither judgment may infer original authorization, rename a failure PASS or reactivate a historical consumer campaign.

GitHub issues317–320 concern DETRAN acceptance of delivered1.6.1 contracts; their latest comments supersede stale1.6.0 body headings, and319 closes last. PORM PF06 is a distinct R3 criterion. This decision changes no consumer pin, closes no issue, and establishes neither formal DEVAI acceptance nor new STYNX release/publication authority. The local two-parent post-merge-adapter incompatibility is also independent of the documented rounds-index materialization.
