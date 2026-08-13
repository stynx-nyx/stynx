# Round 1 plan

**Status:** active governed pilot under ADR-DEVAI-ADOPTION-0001.

## Goal

Prove DEVAI 1.1's supported control loop on STYNX at exact base
`0727797383daae24f5676cca74163df4962f329a` without changing product behavior.

## Waves

1. Architect declares and queues the pilot.
2. Engineer starts the queued task in its managed worktree and runs the exact
   read-only trace verifier.
3. Inspector creates a reference gap, pauses the task, verifies deterministic
   triage, resolves the gap, and resumes the task.
4. Engineer completes the task and releases its locks/worktree.
5. Auditor verifies the evidence chain and observes the exact candidate twice.

## Gates

- `queue-materialized`: the queued item becomes a schema-valid startable task
  through a supported DEVAI action.
- `managed-isolation`: lock acquisition/release and the task worktree are
  evidenced.
- `reference-gap`: pause and resolution are recorded without invented
  authority.
- `deterministic-triage`: replay yields byte-identical verdict evidence.
- `closure`: the exact task check, evidence chain, and observation replay pass.
