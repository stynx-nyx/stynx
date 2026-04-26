import { spawn } from 'child_process';
import chalk from 'chalk';
import { resolveBackendWorkspace, WORKSPACE_ROOT } from './targets';

export interface BackendDeployOptions {
  dryRun?: boolean;
  debug?: boolean;
}

function runNpm(args: string[], cwd: string, dryRun?: boolean): Promise<void> {
  if (dryRun) {
    console.log(chalk.yellow(`dry-run: npm ${args.join(' ')} (cwd=${cwd})`));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, { cwd, stdio: 'inherit', env: process.env });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(' ')} exited with code ${code}`));
    });
  });
}

export async function buildBackend(options: BackendDeployOptions = {}): Promise<void> {
  const workspace = resolveBackendWorkspace();
  if (options.debug) {
    console.log(chalk.gray(`Backend build target workspace: ${workspace}`));
  }
  await runNpm(['run', 'build', '--workspace', workspace], WORKSPACE_ROOT, options.dryRun);
}

export async function deployBackendPlaceholder(options: BackendDeployOptions = {}): Promise<void> {
  if (!options.dryRun) {
    console.log(chalk.blue('Backend build ready. Implement EC2 deployment pipeline here.'));
  } else {
    console.log(chalk.yellow('dry-run: skipping backend deployment placeholder'));
  }
}
