#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const publisher = readFileSync(resolve(repoRoot, 'scripts/publish-docs-site.mjs'), 'utf8');
const docusaurus = readFileSync(resolve(repoRoot, 'docs/site/docusaurus.config.js'), 'utf8');
const docsWorkflow = readFileSync(resolve(repoRoot, '.github/workflows/docs.yml'), 'utf8');
const releasePrep = readFileSync(resolve(repoRoot, '.github/workflows/release-prep.yml'), 'utf8');
const workflowDir = resolve(repoRoot, '.github/workflows');
const workflows = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/u.test(name))
  .map((name) => ({ name, text: readFileSync(resolve(workflowDir, name), 'utf8') }));
const failures = [];

for (const { name, text } of workflows) {
  for (const pattern of [
    /actions\/deploy-pages@/u,
    /actions\/upload-pages-artifact@/u,
    /peaceiris\/actions-gh-pages@/u,
    /github-pages-deploy-action@/u,
    /docusaurus\s+deploy/u,
    /git\s+push[^\n]*gh-pages/u,
  ]) {
    if (pattern.test(text)) {
      failures.push(`${name}: CI must validate docs but must not publish them`);
      break;
    }
  }
}

requireText(publisher, /command === 'prepare'/u, 'local publisher must expose prepare');
requireText(publisher, /command === 'publish'/u, 'local publisher must expose publish');
requireText(
  publisher,
  /--confirm-publish/u,
  'local publication must require an explicit confirmation flag',
);
requireText(
  publisher,
  /STYNX_ENABLE_PAGES_DEPLOY/u,
  'local publication must require the Owner-controlled opt-in',
);
requireText(publisher, /origin\/main/u, 'local publication must bind exact origin/main');
requireText(
  publisher,
  /refs\/heads\/main:refs\/remotes\/origin\/main/u,
  'local publication must refresh the exact origin/main ref',
);
requireText(
  publisher,
  /--untracked-files=all/u,
  'local publication must reject untracked candidate inputs',
);
requireText(publisher, /sourceTree/u, 'local publication manifest must bind the Git tree');
requireText(publisher, /siteDigest/u, 'local publication manifest must bind site bytes');
requireText(publisher, /manifest\.json/u, 'local publication must materialize a manifest');
requireText(publisher, /\.nojekyll/u, 'the published artifact must disable Jekyll processing');
requireText(
  publisher,
  /DOCS_BUNDLE_NOJEKYLL/u,
  'publication must validate the empty .nojekyll artifact at runtime',
);
requireText(publisher, /--signing-key/u, 'local publication must require an explicit signing key');
requireText(publisher, /'commit',\s*'-S'/u, 'the publication commit must be signed');
requireText(
  publisher,
  /verify-commit/u,
  'the local publisher must cryptographically verify its signed commit',
);
requireText(
  publisher,
  /signerFingerprint/u,
  'the publication receipt must record the signer fingerprint',
);
requireText(publisher, /HEAD:gh-pages/u, 'the local publisher must advance only gh-pages');
requireText(
  publisher,
  /stynx-nyx\/stynx/u,
  'the local publisher must bind the exact repository identity',
);
if (publisher.indexOf('verify-commit') > publisher.indexOf('HEAD:gh-pages')) {
  failures.push('the publication commit signature must be verified before push');
}

requireText(
  docusaurus,
  /url:\s*'https:\/\/stynx-nyx\.github\.io'/u,
  'Docusaurus URL must match the repository organization',
);
requireText(
  docusaurus,
  /organizationName:\s*'stynx-nyx'/u,
  'Docusaurus organization must be stynx-nyx',
);
requireText(docusaurus, /baseUrl:\s*'\/stynx\/'/u, 'Docusaurus base URL must be /stynx/');
requireText(docusaurus, /onBrokenLinks:\s*'throw'/u, 'Broken Docusaurus links must fail');
requireText(
  docsWorkflow,
  /@stynx-nyx\/docs-site build:ci/u,
  'CI must retain the full documentation freshness gate',
);
requireText(
  releasePrep,
  /node scripts\/verify-pages-publication\.mjs/u,
  'release preparation must verify the local publication boundary',
);

if (failures.length > 0) {
  console.error('[pages-publication] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[pages-publication] OK: local exact-main Pages publication is fail-closed');

function requireText(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message);
}
