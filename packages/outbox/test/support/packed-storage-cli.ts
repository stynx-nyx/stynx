import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Consume actual packed STYNX code, with external frozen dependencies linked
// locally. No workspace STYNX source or network installation is substituted.
export function packedStorageCli() {
  const repository = resolve(__dirname, '../../../..');
  const directory = mkdtempSync(join(tmpdir(), 'stynx packed outbox á-'));
  const modules = join(directory, 'node_modules');
  const scope = join(modules, '@stynx-nyx');
  mkdirSync(scope, { recursive: true });
  try {
    for (const name of ['contracts', 'core', 'data', 'outbox']) {
      const original = join(repository, 'packages', name);
      const packed = spawnSync(
        'pnpm',
        ['--dir', original, 'pack', '--pack-destination', directory, '--json'],
        {
          cwd: directory,
          encoding: 'utf8',
        },
      );
      if (packed.error || packed.status !== 0)
        throw new Error(`Cannot pack ${name}: ${packed.stderr}`);
      const report = JSON.parse(packed.stdout);
      const tarball = resolve(original, (Array.isArray(report) ? report[0] : report).filename);
      const installed = join(scope, name);
      mkdirSync(installed);
      const extraction = spawnSync(
        'tar',
        ['-xzf', tarball, '-C', installed, '--strip-components=1'],
        { encoding: 'utf8' },
      );
      if (extraction.error || extraction.status !== 0)
        throw new Error(`Cannot extract packed ${name}`);
      const dependencies = join(original, 'node_modules');
      for (const entry of readdirSync(dependencies).filter(
        (entry) => !entry.startsWith('.') && entry !== '@stynx-nyx',
      )) {
        const names = entry.startsWith('@')
          ? readdirSync(join(dependencies, entry)).map((name) => `${entry}/${name}`)
          : [entry];
        for (const dependency of names) {
          const target = join(installed, 'node_modules', dependency);
          mkdirSync(dirname(target), { recursive: true });
          if (!existsSync(target)) symlinkSync(join(dependencies, dependency), target, 'dir');
        }
      }
    }
    const manifest = JSON.parse(readFileSync(join(scope, 'outbox/package.json'), 'utf8'));
    const cli = join(scope, 'outbox', manifest.bin['stynx-outbox-storage']);
    if (!existsSync(cli)) throw new Error('Packed storage executable is missing');
    return {
      directory,
      run: (args: string[], env: NodeJS.ProcessEnv) =>
        spawnSync(process.execPath, [cli, ...args], {
          cwd: directory,
          env,
          encoding: 'utf8',
          timeout: 30_000,
        }),
      dispose: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
