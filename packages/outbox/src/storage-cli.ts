#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createStynxPgClient } from '@stynx-nyx/data';
import { renderOutboxStorage, verifyOutboxStorage, type OutboxStorageOptions } from './storage';

export interface OutboxStorageCommandIO {
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
}

/** The executable and embedders share this exact command boundary. */
export async function runOutboxStorageCommand(
  args: string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
  io: OutboxStorageCommandIO = process,
): Promise<number> {
  try {
    return await execute(args, environment, io);
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    io.stderr.write(
      `${JSON.stringify({
        supported: false,
        error: 'Outbox storage verification refused',
        code:
          typeof code === 'string' &&
          (/^[A-Z0-9]{5}$/u.test(code) ||
            [
              'ECONNREFUSED',
              'ENOTFOUND',
              'ETIMEDOUT',
              'EHOSTUNREACH',
              'ERR_PARSE_ARGS_UNKNOWN_OPTION',
              'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
              'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL',
            ].includes(code))
            ? code
            : 'STORAGE_VERIFICATION_UNAVAILABLE',
      })}\n`,
    );
    return 1;
  }
}

async function execute(
  args: string[],
  environment: NodeJS.ProcessEnv,
  io: OutboxStorageCommandIO,
): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      render: { type: 'boolean', default: false },
      'owner-role': { type: 'string' },
      'app-role': { type: 'string' },
      'reader-role': { type: 'string' },
      'no-reader': { type: 'boolean', default: false },
      'tenant-schema': { type: 'string' },
      'tenant-table': { type: 'string' },
      'tenant-column': { type: 'string' },
      'database-url-env': { type: 'string', default: 'STYNX_STORAGE_DATABASE_URL' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values['no-reader'] && values['reader-role'] !== undefined)
    throw new Error('Conflicting reader options');
  const tenant = [values['tenant-schema'], values['tenant-table'], values['tenant-column']];
  if (tenant.some((part) => part !== undefined) && tenant.some((part) => part === undefined)) {
    throw new Error('All three tenant identifiers are required');
  }
  const options: OutboxStorageOptions = {
    ...(values['owner-role'] === undefined ? {} : { ownerRole: values['owner-role'] }),
    ...(values['app-role'] === undefined ? {} : { appRole: values['app-role'] }),
    ...(values['reader-role'] === undefined ? {} : { readerRole: values['reader-role'] }),
    ...(values['no-reader'] ? { readerRole: null } : {}),
    ...(tenant[0] === undefined
      ? {}
      : { tenantTable: { schema: tenant[0], table: tenant[1]!, column: tenant[2]! } }),
  };
  // Validate options before acquiring a connection; rendering is wholly offline.
  const artifact = renderOutboxStorage(options);
  if (values.render) {
    io.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
    return 0;
  }
  const key = values['database-url-env']!;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || !environment[key])
    throw new Error('Missing database environment binding');
  const client = createStynxPgClient({ connectionString: environment[key] });
  try {
    await client.connect();
    await client.query('begin read only');
    const report = await verifyOutboxStorage(client, options);
    io.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.supported ? 0 : 1;
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

// Compare the actual entry path, so imports remain side-effect free.
export const storageCommandExecution =
  existsSync(process.argv[1] ?? '') && realpathSync(process.argv[1]!) === realpathSync(__filename)
    ? runOutboxStorageCommand().then((code) => {
        process.exitCode = code;
        return code;
      })
    : undefined;
