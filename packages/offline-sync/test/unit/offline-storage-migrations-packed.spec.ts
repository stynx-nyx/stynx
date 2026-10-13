import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderOfflineStorageMigrations } from '../../src/storage';
import { packedStorageCli } from '../support/packed-storage-cli';

// INV-OFFLINE-001: installed rendering requires neither a checkout nor live state.
describe('Packed ordered offline migration renderer', () => {
  it('renders identical output offline with filesystem and process effects refused', () => {
    const packed = packedStorageCli();
    try {
      const installed = join(
        packed.directory,
        'node_modules/@stynx-nyx/offline-sync/dist/offline-sync/src',
      );
      expect(readFileSync(join(installed, 'index.js'), 'utf8')).toContain(
        'renderOfflineStorageMigrations',
      );
      const options = {
        ownerRole: 'proprietário',
        appRole: 'aplicação',
        readerRole: null,
        tenantTable: { schema: 'auth', table: 'tenants', column: 'tenant_uuid' },
      };
      const result = spawnSync(
        process.execPath,
        [
          '-e',
          `
        const renderer = require(${JSON.stringify(join(installed, 'storage.js'))}).renderOfflineStorageMigrations;
        const fs = require('node:fs'), cp = require('node:child_process');
        for (const name of ['readFileSync','writeFileSync','readdirSync','statSync','lstatSync','openSync','accessSync'])
          fs[name] = () => { throw new Error('INSPECTOR_RENDER_FILESYSTEM_EFFECT'); };
        for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])
          cp[name] = () => { throw new Error('INSPECTOR_RENDER_PROCESS_EFFECT'); };
        console.log(JSON.stringify(renderer(${JSON.stringify(options)})));
      `,
        ],
        { cwd: packed.directory, encoding: 'utf8', timeout: 10_000 },
      );
      expect(result.error).toBe(undefined);
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(renderOfflineStorageMigrations(options));
    } finally {
      packed.dispose();
    }
  });
});
