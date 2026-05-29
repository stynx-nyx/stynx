# Production-Grade Private Regulated Deployment

**Authority:** Architect (Constitution Article 6).

For STYNX readiness work, **production-grade** means credible for a **private
regulated deployment**. This is stricter than "MVP demo ready": the framework
must provide enforceable contracts, tenant isolation evidence, release controls,
security evidence, and adopter-install proof before a regulated private app uses
it as a dependency.

## AI Working Agents

These workstreams are suitable for AI agents because they can be implemented and
verified from repository evidence without external business authority.

1. **CI Proof Agent**: make local and remote gates explicit, deterministic, and
   evidence-producing. Owns scripts that fail when required production-readiness
   checks are missing.
2. **RLS Runtime Agent**: strengthen fail-closed tenant-isolation coverage across
   auth, audit, storage, flow, records, and reference API routes.
3. **Frontend Browser Agent**: enforce browser-level reference-web smoke and
   accessibility gates, plus fixture coverage for critical web packages.
4. **Release Provenance Agent**: verify package publication provenance, public API
   baselines, packaged consumer fixtures, changelog discipline, and release
   policy gates.
5. **Operational Rehearsal Agent**: maintain install docs, starter verification,
   release artifacts, migration runbooks, known limitations, and operational
   rehearsal checklists.
6. **Observability/Error Taxonomy Agent**: keep request telemetry guidance,
   error-taxonomy contracts, and SDK/OpenAPI error shapes aligned.
7. **Security Hardening Agent**: maintain SBOM, license policy, secret scanning,
   dependency review, audit remediation, and security-release evidence.

## Human Actions

These actions require human authority, external credentials, or deployment
context. AI agents can prepare evidence and scripts, but should not invent these
decisions.

1. **Define/approve production bar**: production-grade is now defined as private
   regulated deployment.
2. **Registry/provenance setup**: choose npm, GitHub Packages, or a private
   registry; configure package namespace ownership; provide `NPM_TOKEN`; confirm
   whether npm provenance is mandatory for all packages.
3. **Remote CI permission**: authorize push/PR/GitHub Actions execution when
   remote evidence is required.
4. **Adopter rehearsal target**: choose the SGP, PEC, TEAT, or other fixture app
   that will perform a real packaged-tarball install rehearsal.
5. **Auth/object-store/DB staging resources**: provide regulated staging
   resources for end-to-end deployment rehearsal: OIDC/Cognito, PostgreSQL,
   object store, KMS or equivalent key management, and secrets delivery.
6. **Product scope decision**: confirm whether `domain/demo-bookmark` remains
   scaffold evidence or enters product scope. Until approved otherwise, it is
   treated as scaffold evidence.
7. **Security/legal reviewer**: assign ownership for license exceptions,
   vulnerability exceptions, privacy/security review, and acceptable-risk
   sign-off.
8. **Operational ownership**: name owners for incident response, vulnerability
   remediation cadence, release approval, and adopter migration support.
9. **Release approval**: approve the final release candidate after local gates,
   remote CI, package provenance, and staging rehearsal evidence are complete.

## Current Enabling Requests

To proceed beyond local repository hardening, the AI working agents need these
inputs from humans:

- Registry target and credentials: registry URL, namespace owner, `NPM_TOKEN`,
  and provenance policy.
- Remote execution permission: branch/PR target and approval to run GitHub
  Actions for release and CI proof.
- Real adopter rehearsal target: exact repo/path and whether SGP, PEC, TEAT, or
  a new private fixture is the first deployment candidate.
- Staging resource bundle: OIDC issuer/client config, PostgreSQL connection,
  object-store bucket, key-management policy, and deployment secrets.
- Security/legal reviewer: named approver for license and vulnerability
  exception decisions.
- Final product decision for `domain/demo-bookmark`: scaffold evidence by
  default, product scope only if explicitly approved.
