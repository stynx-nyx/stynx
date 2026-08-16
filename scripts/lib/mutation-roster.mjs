import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export const MUTANT_STATUSES = [
  'CompileError',
  'Ignored',
  'Killed',
  'NoCoverage',
  'Pending',
  'RuntimeError',
  'Survived',
  'Timeout',
];

const CONFIG_PATTERN = /^stryker\.(?:conf|config)\.(?:cjs|js|json|mjs|ts)$/u;
const PACKAGE_NAME = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u;

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  throw new Error(`unsupported canonical JSON value: ${typeof value}`);
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function resolveMutationThresholds(policy, packageName, literalOverride) {
  if (literalOverride !== undefined) {
    return {
      break: literalOverride,
      high: literalOverride,
      low: Math.max(60, literalOverride - 10),
    };
  }
  const override = policy.perPackage?.[packageName]?.mutation;
  if (typeof override === 'number') {
    return { break: override, high: override, low: Math.max(60, override - 10) };
  }
  const policyName = override ?? policy.defaults?.mutation ?? 'default';
  const selected = policy.policies?.mutation?.[policyName];
  if (typeof selected === 'number') {
    return { break: selected, high: selected, low: Math.max(60, selected - 10) };
  }
  if (selected && typeof selected === 'object' && typeof selected.break === 'number') {
    return {
      break: selected.break,
      high: typeof selected.high === 'number' ? selected.high : selected.break,
      low: typeof selected.low === 'number' ? selected.low : Math.max(60, selected.break - 10),
    };
  }
  throw new Error(`unknown mutation policy ${String(policyName)} for ${packageName}`);
}

export function discoverMutationRoster(repoRoot) {
  const workspaceRoots = ['packages', 'packages-web'];
  const failures = [];
  const roster = [];
  const policyPath = resolve(repoRoot, 'tools/repo-config/test-policy.json');
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));

  for (const workspaceRoot of workspaceRoots) {
    const absoluteRoot = resolve(repoRoot, workspaceRoot);
    if (!existsSync(absoluteRoot)) {
      failures.push(`${workspaceRoot}: workspace root is missing`);
      continue;
    }
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageDir = resolve(absoluteRoot, entry.name);
      const manifestPath = resolve(packageDir, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const configFiles = readdirSync(packageDir).filter((file) => CONFIG_PATTERN.test(file));
      const strykerScript = manifest.scripts?.stryker;
      if (configFiles.length > 1) {
        failures.push(
          `${relative(repoRoot, packageDir)}: multiple Stryker configs (${configFiles.join(', ')})`,
        );
      }
      if (configFiles.length > 0 && typeof strykerScript !== 'string') {
        failures.push(`${manifest.name}: Stryker config exists but scripts.stryker is missing`);
      }
      if (typeof strykerScript === 'string' && configFiles.length === 0) {
        failures.push(`${manifest.name}: scripts.stryker exists but no Stryker config was found`);
      }
      if (configFiles.length !== 1 || typeof strykerScript !== 'string') continue;
      if (!PACKAGE_NAME.test(manifest.name ?? '')) {
        failures.push(`${relative(repoRoot, packageDir)}: invalid package name`);
        continue;
      }
      const configPath = resolve(packageDir, configFiles[0]);
      const literalMatches = [
        ...readFileSync(configPath, 'utf8').matchAll(/\bthreshold\s*:\s*(\d+(?:\.\d+)?)/gu),
      ];
      if (literalMatches.length > 1) {
        failures.push(`${manifest.name}: multiple literal mutation threshold overrides`);
      }
      const literalThreshold =
        literalMatches[0]?.[1] === undefined ? undefined : Number(literalMatches[0][1]);
      const workspace = relative(repoRoot, packageDir).split('\\').join('/');
      const mutationNa = (policy.notApplicable ?? []).some(
        (declaration) =>
          declaration.packagePattern === manifest.name && declaration.levels?.includes('Mutation'),
      );
      if (mutationNa) failures.push(`${manifest.name}: executable mutation suite is declared N/A`);
      roster.push({
        packageName: manifest.name,
        workspace,
        config: relative(repoRoot, configPath).split('\\').join('/'),
        script: strykerScript,
        thresholds: resolveMutationThresholds(policy, manifest.name, literalThreshold),
      });
    }
  }
  roster.sort((left, right) => left.packageName.localeCompare(right.packageName));
  if (new Set(roster.map((entry) => entry.packageName)).size !== roster.length) {
    failures.push('mutation roster contains duplicate package names');
  }
  return { roster, failures };
}
