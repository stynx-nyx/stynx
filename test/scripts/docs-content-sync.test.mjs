import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '../..');
const docsRequire = createRequire(join(repoRoot, 'docs/site/package.json'));
const { handleBrokenLinks } = docsRequire('@docusaurus/core/lib/server/brokenLinks.js');
const adrRoute = '/docs/adr/performance-contract';
const performanceRoute = '/docs/framework/performance/http-endpoint-slos';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'stynx-docs ação '));
  const script = join(root, 'docs/site/scripts/sync-content.mjs');
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(join(repoRoot, 'docs/site/scripts/sync-content.mjs'), script);
  for (const path of ['packages', 'packages-web', 'tools', 'law/adr', 'docs/performance']) {
    mkdirSync(join(root, path), { recursive: true });
  }
  writeFileSync(
    join(root, 'law/adr/performance-contract.md'),
    '# Performance contract\n\n[Required endpoints](../../docs/performance/http-endpoint-slos.md#required-endpoints)\n\n[Whole contract](../../docs/performance/http-endpoint-slos.md)\n',
  );
  writeFileSync(
    join(root, 'docs/performance/http-endpoint-slos.md'),
    '# Endpoint SLOs\n\n## Required endpoints\n\nProtected route obligations remain mandatory.\n',
  );
  return {
    root,
    output: join(root, 'docs/site/.generated/site-docs'),
    run() {
      const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, 0, result.stderr || result.stdout);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

// Exercise Docusaurus's installed strict link checker with the actual emitted
// Markdown links. The fixture's two known headings supply its collected anchors;
// this is a focused sync boundary, not a replacement for the full site build.
function checkEmittedLinks(output) {
  const adr = readFileSync(join(output, 'adr/performance-contract.md'), 'utf8');
  const collectedLinks = {
    [adrRoute]: {
      links: [...adr.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)].map((match) => match[1]),
      anchors: ['performance-contract'],
    },
  };
  const performance = join(output, 'framework/performance/http-endpoint-slos.md');
  if (existsSync(performance)) {
    const content = readFileSync(performance, 'utf8');
    collectedLinks[performanceRoute] = {
      links: [],
      anchors: content.includes('## Required endpoints\n') ? ['required-endpoints'] : [],
    };
  }
  return handleBrokenLinks({
    collectedLinks,
    routes: Object.keys(collectedLinks).map((path) => ({ path, exact: true })),
    onBrokenLinks: 'throw',
    onBrokenAnchors: 'throw',
  });
}

test('content sync mirrors performance docs and rewrites ADR links without losing anchors', async () => {
  const owned = fixture();
  try {
    owned.run();
    const source = readFileSync(join(owned.root, 'docs/performance/http-endpoint-slos.md'), 'utf8');
    assert.equal(
      readFileSync(join(owned.output, 'framework/performance/http-endpoint-slos.md'), 'utf8'),
      source,
    );
    const adr = readFileSync(join(owned.output, 'adr/performance-contract.md'), 'utf8');
    assert.equal(
      adr,
      '# Performance contract\n\n[Required endpoints](/docs/framework/performance/http-endpoint-slos#required-endpoints)\n\n[Whole contract](/docs/framework/performance/http-endpoint-slos)\n',
    );
    await assert.doesNotReject(checkEmittedLinks(owned.output));
  } finally {
    owned.cleanup();
  }
});

test('removed performance source cannot survive as a stale mirror or pass strict link checking', async () => {
  const owned = fixture();
  try {
    owned.run();
    await assert.doesNotReject(checkEmittedLinks(owned.output));
    rmSync(join(owned.root, 'docs/performance/http-endpoint-slos.md'));
    owned.run();
    assert.equal(
      existsSync(join(owned.output, 'framework/performance/http-endpoint-slos.md')),
      false,
    );
    assert.match(
      readFileSync(join(owned.output, 'adr/performance-contract.md'), 'utf8'),
      /http-endpoint-slos#required-endpoints/u,
    );
    await assert.rejects(checkEmittedLinks(owned.output), /Docusaurus found broken links/u);
  } finally {
    owned.cleanup();
  }
});

test('content sync preserves an unresolved anchor so strict checking can refuse it', async () => {
  const owned = fixture();
  try {
    const source = join(owned.root, 'law/adr/performance-contract.md');
    writeFileSync(
      source,
      readFileSync(source, 'utf8').replace('#required-endpoints', '#missing-proof'),
    );
    owned.run();
    assert.match(
      readFileSync(join(owned.output, 'adr/performance-contract.md'), 'utf8'),
      /\]\(\/docs\/framework\/performance\/http-endpoint-slos#missing-proof\)/u,
    );
    assert.equal(
      existsSync(join(owned.output, 'framework/performance/http-endpoint-slos.md')),
      true,
    );
    await assert.rejects(checkEmittedLinks(owned.output), /Docusaurus found broken anchors/u);
  } finally {
    owned.cleanup();
  }
});
