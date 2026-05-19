// Single source of truth for coverage + mutation thresholds across the
// workspace. Reads scripts/test-matrix.config.json and resolves per-package
// values. Imported by:
//   - tools/repo-config/vitest.base.mjs       (coverage gates)
//   - tools/stryker/base.mjs                  (mutation gates)
//   - scripts/render-test-matrix.mjs          (cell colouring)
//
// Per-package overrides live under `perPackage[packageName]` in the config:
//   "perPackage": { "@stynx/auth": { "coverage": "strict", "mutation": "strictest" } }
//
// Policies (under `policies.coverage` and `policies.mutation`) define named
// presets; `defaults` picks which preset applies workspace-wide when no
// per-package override exists.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../../scripts/test-matrix.config.json');

let cached;

function load() {
  if (cached) return cached;
  cached = JSON.parse(readFileSync(configPath, 'utf8'));
  return cached;
}

/**
 * Resolve the coverage threshold for a package.
 * @param {string} packageName  e.g. "@stynx/auth"
 * @returns {{lines:number, branches:number, functions:number, statements:number}}
 */
export function getCoverageThreshold(packageName) {
  const cfg = load();
  const policyName =
    cfg.perPackage?.[packageName]?.coverage ??
    cfg.defaults?.coverage ??
    'default';
  const policy = cfg.policies?.coverage?.[policyName];
  if (!policy) {
    throw new Error(`[test-thresholds] unknown coverage policy '${policyName}' for ${packageName}`);
  }
  return { ...policy };
}

/**
 * Resolve the mutation break threshold (single number) for a package.
 * Per-package values may be either a policy name (e.g. "strict") or a literal
 * number; numbers win over policies.
 * @param {string} packageName
 * @returns {number}
 */
export function getMutationThreshold(packageName) {
  const cfg = load();
  const override = cfg.perPackage?.[packageName]?.mutation;
  if (typeof override === 'number') return override;
  const policyName = override ?? cfg.defaults?.mutation ?? 'default';
  const policy = cfg.policies?.mutation?.[policyName];
  if (typeof policy !== 'number') {
    throw new Error(`[test-thresholds] unknown mutation policy '${policyName}' for ${packageName}`);
  }
  return policy;
}

/**
 * Coverage thresholds for the renderer's overall workspace gate.
 * Falls back to the legacy top-level `thresholds` key for compat.
 */
export function getMatrixCoverageThreshold() {
  const cfg = load();
  return cfg.thresholds ?? cfg.policies?.coverage?.default ?? null;
}

export function getRawConfig() {
  return load();
}
