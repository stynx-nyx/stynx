---
adr_id: ADR-0037
title: Exact S8 auxiliary descriptor admission
status: proposed
date: 2026-10-24
authors: ['Architect']
---

# ADR0037 — Exact S8 auxiliary descriptor admission

This prospective record belongs only to the unmerged auxiliary branch. It
records preparation and independent review, not an Owner approval, receipt,
remote dispatch or product acceptance. Product C and its generated workflow
remain unchanged. The exact final review checkpoint B is recorded externally
after this commit to avoid a self-referential identity.

## Fixed identities and observed blocker

- Product C: `f3e4d91051ae9d3259c35c244cae8e6a2c3258db`.
- Product tree: `dd98256af15c34a37ed8d0efcfdfef1394a8ab77`.
- Main control: `10514fea7af80746e419eab07cdb274ff9dfd324`.
- Engineer W0: `4f9c1327cfdda4e2c2c3706c8386d54e2b6a9cd9`.
- W0 workflow Git blob: `4542195c27ffde9b3448bae4ba7ca8efb2f1fa22`.
- W0 workflow SHA-256:
  `29efb9f38d4f69eef7684fc464313363a0481b77ecc231f5c672d122fd5cb7ba`.
- Inspector checkpoint: `218aad179f6a73ddead19761d6cf623f806fda64`.
- Product receipt digest:
  `328c22410ce1a7dabba4c3ba519d9d346e84efd3f8550bab757fbe4fb07775df`.
- Product policy digest:
  `99bacb998707d24b9c7f038061b80f9b6c58b77ffdf52ddc2812e81638a9c6b5`.

Remote run `40110444156` failed policy byte comparison before signature
verification. The generated workflow correctly reconstructs policy from inert
candidate Git data with the main descriptor and main-owned trust, toolchain and
environment controls. Local qualification used C's approved descriptor. The
failed remote run is retained; a local PASS is not a remote PASS.

Both descriptors retain 17 tasks and the 15-node RC closure. The entire delta is
13 added `test:unit` selectors and one `db:rls` selector. No task command,
dependency, environment, output, profile population or PASS requirement changes.
Trusted canonical descriptor digests are:

- Control: `9874165c7677c070c472d6facfe8666fd48fb680244e8cf3b51e8b44fbf77b92`.
- Candidate: `b7f8b028b6cbe3037532be611fc2d4b5f5b14c72b23f43a25fbd254cf009256a`.

## Existing route and authority boundary

[ADOPTION-0022](2026-10-12-supported-scorecard-task-collection.md) specifies the
auxiliary-only descriptor transition route. Its former four-task transition and
approval do not cover these new identities. It expressly requires concrete Owner
authority for the exact auxiliary CI receipt and dispatch. Existing S8 and
ADR0035 approval covers product selectors and preparation; no new approval of
those product changes is requested here.

Installed DEVAI remains 2.6.2. Its closed attested-RC configuration and generated
workflow expose no descriptor-promotion option. Scaffold and upgrade regenerate
the same workflow, and Doctor checks byte equality. This proposal does not patch
that configuration, generator, installed package or generated product workflow.
The published evidence publisher supports `--default-branch` as the workflow
execution ref while `candidate_sha` stays C. That supported dispatch parameter
is used only after the exact auxiliary effect is authorized.

The isolated auxiliary worktree was created from C with the coordinator-approved
plain Git worktree fallback: no suitable auxiliary checkout existed, and managed
creation could not suppress unknown heavy setup during a released host
reservation. No product checkout or protected dirty work was reused.

## Exact guard and unchanged verifier

W0 changes only the registered verifier workflow by adding an admission step and
selecting its output as the policy builder's descriptor. The guard first binds
C, C's tree and the exact main control commit. It parses candidate/control JSON
as inert data and imports canonical helpers solely from the downloaded trusted
verifier. It executes no candidate source or package code.

Canonical descriptor equality chooses control. The sole differing-descriptor
transition requires both exact digests above and reconstructs candidate from
control with these additions in order:

- `test:unit` exact selectors: `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `test-tasks.json`, `tools/repo-config/vitest.base.mjs`.
- `test:unit` glob selectors: `packages/*/package.json`,
  `packages-web/*/package.json`, `tools/*/package.json`, `test/*/package.json`,
  `packages/*/vitest.config.*`, `packages-web/*/vitest.config.*`,
  `tools/*/vitest.config.*`, `test/*/vitest.config.*`.
- `db:rls` exact selector: `packages/cli/engines/rls-negative.mjs`.

It requires complete canonical reconstruction equality, not merely two digest
matches. Any other delta refuses. All main trust/toolchain/environment controls,
pinned trusted 2.4.0 package integrity/provenance, inert checkout, exact policy
`cmp`, signature trust, artifact completeness, check provenance and permissions
remain intact. Removing only this guard and restoring the descriptor argument
reproduces the original generated workflow byte-for-byte, SHA-256
`30bb7935a0ad1ad7303217f77ac64e9c0c4c6ae3f70860d7c21f3a14e35964dc`.

## Independent evidence and limits

Inspector verified 393 trusted-provider files against the pinned published 2.4.0
archive, with provenance digest
`fc79da07d4d4dfa466548337a4944ae1b7e0bfdcf2f1c334b341bb1ad477cd4d`.
On identical C and controls, trusted 2.4.0 and installed 2.6.2 produce byte-equal
policies for each descriptor separately. Main policy digest is
`f78bd6eb50abbdb6bdeb8ee04adbf45d1426999dafdd362277f397f9fe57009a`;
candidate policy is the signed digest above. The mismatch is not a provider
version discrepancy.

Inspector executes the actual extracted guard with real Git identities and the
trusted canonical implementation. All 31 cases passed after its commit in
6.26 seconds: unchanged equality, exact transition, core comparison, descriptor
and identity negatives, and two reconstruction counterfactuals. Source review
independently confirmed the unchanged verifier core. Official trace binds the
new test's 27 assertion sites under existing INV-CORE-001; no existing test,
invariant or threshold changes. These focused auxiliary results do not claim
product Doctor, auxiliary product RC or remote verification success.

Evidence is preserved under the consolidation Inspector directory in
`s8-f3e4d910-protected-policy-mismatch/trusted-provider-equivalence.json` and
`s8-aux-descriptor-admission/{summary.json,postcommit31.log}`. Product C's complete
15-node signed qualification, three artifacts and 46 passing coverage populations
remain separate. Preserve earlier failed runs and the unexplained retry-05 Auth
failure; no root cause is inferred from retry-06 success.

## Concrete prospective effect and postconditions

Present literal C, W0/blob and reviewed B to the Owner. The requested authority
is only W0's exact `FORBID-CI-WITHOUT-ADR` receipt and one auxiliary dispatch for
C. A future B1 may descend from B only by appending that exact receipt and any
necessary unchanged-projection Architect trace metadata; its workflow must equal
W0 and all other reviewed bytes remain unchanged. No receipt is issued here.

Keep the receipt on the auxiliary branch because W0 is absent from product
ancestry. Never merge auxiliary workflow, tests, law or receipt commits into C
or main. Product's own exact-SHA receipt obligations remain separate.

After approval, normal hooks must admit auxiliary B1 before remote push. Verify
remote C/B1, controls, workflow blob and the signed bundle immediately before the
supported publisher dispatch with the approved auxiliary ref. Its existing proof
tag may be reused only when the complete tree is identical; `TAG_COLLISION`
refuses differing bytes. Never overwrite a tag or relabel evidence.

Verify actual run head B1, inert candidate input C, and the unique successful
`verified-local-rc` CheckRun on C. Retain the failed ordinary-main attempt. Only
then use normal protected product integration. Verify full landed-main tree
identity with C and successful ordinary generated-workflow verification with the
now-landed descriptor. A C check is not a main check. Preserve any conditional
source-to-landed product receipt follow-up before post-merge acceptance.

No direct-main push, admin bypass, protected-setting relaxation, arbitrary
candidate-policy admission, new release, publication or downstream acceptance is
authorized. Changed reviewed identities or incomplete evidence require renewed
review. S7, A+B and C+D remain separate work; this proposal does not ratify
ADR0034, supplemental archive types or release-line selection.
