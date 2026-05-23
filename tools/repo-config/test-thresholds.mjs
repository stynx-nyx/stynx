// Single source of truth for coverage + mutation + perf thresholds across the
// workspace. Reads scripts/test-matrix.config.json and resolves per-package
// values. Imported by:
//   - tools/repo-config/vitest.base.mjs       (coverage gates)
//   - tools/stryker/base.mjs                  (mutation gates)
//   - devai render-matrix                     (cell colouring)
//
// Per-package overrides live under `perPackage[packageName]` in the config:
//   "perPackage": { "@stynx/auth": { "coverage": "strict", "mutation": "strictest" } }
//
// Policies (under `policies.coverage`, `policies.mutation`, and `policies.perf`) define named
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
 * Resolve the full mutation threshold set for a package.
 * Policy values may be:
 *   - a number (legacy / single-floor policy): treated as { break: N, high: N, low: max(60, N-10) }
 *   - an object {break, high, low?}: returned verbatim (tiered policy)
 *   - a per-package literal number: same as legacy number policy
 * @param {string} packageName
 * @returns {{break:number, high:number, low:number}}
 */
export function getMutationThresholds(packageName) {
  const cfg = load();
  const override = cfg.perPackage?.[packageName]?.mutation;
  if (typeof override === 'number') {
    return { break: override, high: override, low: Math.max(60, override - 10) };
  }
  const policyName = override ?? cfg.defaults?.mutation ?? 'default';
  const policy = cfg.policies?.mutation?.[policyName];
  if (typeof policy === 'number') {
    return { break: policy, high: policy, low: Math.max(60, policy - 10) };
  }
  if (policy && typeof policy === 'object' && typeof policy.break === 'number') {
    const breakT = policy.break;
    const highT = typeof policy.high === 'number' ? policy.high : breakT;
    const lowT = typeof policy.low === 'number' ? policy.low : Math.max(60, breakT - 10);
    return { break: breakT, high: highT, low: lowT };
  }
  throw new Error(`[test-thresholds] unknown mutation policy '${policyName}' for ${packageName}`);
}

/**
 * Resolve the mutation break threshold (single number) for a package.
 * Backward-compatible scalar accessor — returns the `break` value only.
 * Use {@link getMutationThresholds} to access the high/low/break triplet.
 * @param {string} packageName
 * @returns {number}
 */
export function getMutationThreshold(packageName) {
  return getMutationThresholds(packageName).break;
}

/**
 * Resolve the perf smoke thresholds for a package/workspace.
 * @param {string} packageName
 * @returns {{p50_ms:number, p95_ms:number, rps_min:number}}
 */
export function getPerfThreshold(packageName = 'stynx-workspace') {
  const cfg = load();
  const override = cfg.perPackage?.[packageName]?.perf;
  const policyName = override ?? cfg.defaults?.perf ?? 'default';
  const policy = cfg.policies?.perf?.[policyName];
  if (!policy || typeof policy !== 'object') {
    throw new Error(`[test-thresholds] unknown perf policy '${policyName}' for ${packageName}`);
  }
  return { ...policy };
}

/**
 * Coverage thresholds for the renderer's overall workspace gate.
 * Coverage thresholds for DEVAI matrix rendering.
 */
export function getMatrixCoverageThreshold() {
  const cfg = load();
  return cfg.policies?.coverage?.default ?? null;
}

export function getRawConfig() {
  return load();
}
