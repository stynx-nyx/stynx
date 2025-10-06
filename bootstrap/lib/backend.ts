import { spawn } from 'child_process';
import chalk from 'chalk';

export interface BackendDeployOptions {
  dryRun?: boolean;
  debug?: boolean;
}

function run(command: string, args: string[], cwd: string, dryRun?: boolean): Promise<void> {
  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow(`dry-run: ${command} ${args.join(' ')} (cwd=${cwd})`));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: process.env });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

export async function buildBackend(options: BackendDeployOptions = {}): Promise<void> {
  await run('npm', ['run', 'build', '--workspace', 'backend'], process.cwd(), options.dryRun);
}

export async function deployBackendPlaceholder(options: BackendDeployOptions = {}): Promise<void> {
  if (!options.dryRun) {
    // eslint-disable-next-line no-console
    console.log(chalk.blue('Backend build ready. Implement EC2 deployment pipeline here.'));
  } else {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow('dry-run: skipping backend deployment placeholder'));
  }
}
