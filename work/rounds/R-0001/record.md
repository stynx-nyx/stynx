---
schemaVersion: '1.0.0'
id: 'R-0001'
title: 'DEVAI 1.1 STYNX operational pilot'
type: 'adoption-pilot'
kind: 'validation'
status: 'active'
date: '2026-08-13'
authority: 'Architect'
goal: 'Prove the supported DEVAI control loop at one exact STYNX candidate.'
declared_by: 'ADR-DEVAI-ADOPTION-0001'
isolation:
  kind: 'managed-worktree'
  branch: 'codex/devai-1.0.1-greenfield-adoption'
  base_sha: '0727797383daae24f5676cca74163df4962f329a'
waves:
  - id: 'W-0001'
    title: 'Role-separated operational proof'
    roles: ['architect', 'engineer', 'inspector', 'auditor']
    type: 'serial'
    lock_scopes: ['F2:scripts/verify-devai-trace.mjs']
    gates:
      [
        'queue-materialized',
        'managed-isolation',
        'reference-gap',
        'deterministic-triage',
        'closure',
      ]
gates:
  ['queue-materialized', 'managed-isolation', 'reference-gap', 'deterministic-triage', 'closure']
orchestrator_prompt: 'prompts/00-orchestrator.md'
plan_path: 'plan.md'
---

# R-0001

Canonical round lifecycle record. The frontmatter is schema-authoritative.
