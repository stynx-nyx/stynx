import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const appRoot = process.cwd();
const workspaceRoots = ['packages', 'packages-web'];
const workspacePackages = new Map();

for (const workspaceRoot of workspaceRoots) {
  if (!existsSync(workspaceRoot)) {
    continue;
  }

  for (const child of readdirSync(workspaceRoot)) {
    const manifestPath = join(workspaceRoot, child, 'package.json');
    if (!existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (typeof manifest.name === 'string') {
      workspacePackages.set(manifest.name, join(appRoot, workspaceRoot, child));
    }
  }
}

const nodeModulesPaths = [
  join(appRoot, 'node_modules'),
  ...Array.from(workspacePackages.values(), (packageRoot) => join(packageRoot, 'node_modules')),
];

for (const nodeModulesPath of nodeModulesPaths) {
  if (!existsSync(nodeModulesPath)) {
    continue;
  }

  for (const [packageName, packageRoot] of workspacePackages) {
    const linkPath = join(nodeModulesPath, packageName);
    if (!existsSync(linkPath)) {
      continue;
    }

    rmSync(linkPath, { recursive: true, force: true });
    mkdirSync(dirname(linkPath), { recursive: true });
    symlinkSync(relative(dirname(linkPath), packageRoot), linkPath, 'dir');
  }
}
