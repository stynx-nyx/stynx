#!/usr/bin/env -S node --experimental-strip-types
// The engine is plain ESM shipped by @stynx-nyx/cli (`stynx verify-stynx-boundary --json`, SM-07).
import {
  readBoundaryConfig,
  verifyStynxBoundary,
} from '../packages/cli/engines/stynx-boundary.mjs';

type Violation = { message: string };
type BoundaryResult = { scanned: string[]; seams: string[]; violations: Violation[] };

// The repository keeps its `package.json` `stynx.boundary` fallback; the CLI requires `.stynxrc.json`.
const repoRoot = process.cwd();
const { config } = readBoundaryConfig(repoRoot, { allowPackageJson: true });
const result: BoundaryResult = verifyStynxBoundary(repoRoot, config);

if (result.violations.length > 0)
  throw new Error(
    `STYNX boundary violations:\n${result.violations.map((violation) => violation.message).join('\n')}`,
  );
console.log(
  `STYNX boundary verification passed: ${result.scanned.length} files, ${result.seams.length} STYNX seams.`,
);
