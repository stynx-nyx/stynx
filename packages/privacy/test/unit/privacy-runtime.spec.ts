import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModuleRef } from '@nestjs/core';
import { StynxObjectStore } from '@stynx/storage';
import { PrivacyConfigurationError, PrivacyValidationError } from '../../src/errors';
import { PiiMapService } from '../../src/pii-map.service';
import { PrivacyObjectStoreService } from '../../src/privacy-object-store.service';
import { generateRopaMarkdown } from '../../src/ropa';

vi.mock('@stynx/storage', () => ({
  StynxObjectStore: vi.fn(),
}));

describe('privacy runtime helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('generates ROPA markdown with defaults and data-flow metadata', () => {
    const markdown = generateRopaMarkdown([
      {
        tableSchema: 'auth',
        tableName: 'users',
        columnName: 'email',
        strategy: 'hash_with_salt',
        category: 'contact',
        subjectColumn: 'id',
        notes: 'primary email',
        retention: {
          timestampColumn: 'created_at',
          olderThanDays: 30,
          target: 'archive',
        },
      },
      {
        tableSchema: 'app',
        tableName: 'events',
        columnName: 'payload',
        strategy: 'nullify',
      },
    ], {
      controllers: ['STYNX'],
      processors: ['AWS'],
      categories: { contact: 'Contact data' },
    });

    expect(markdown).toContain('| auth.users | email | hash_with_salt | Contact data | id | archive 30d via created_at | primary email |');
    expect(markdown).toContain('| app.events | payload | nullify | unspecified | unspecified | none |  |');
    expect(markdown).toContain('Controllers: STYNX');
    expect(markdown).toContain('Processors: AWS');
  });

  it('wraps privacy errors with stable codes and optional context', () => {
    expect(new PrivacyValidationError('bad input', { field: 'email' })).toMatchObject({
      code: 'PRIVACY_VALIDATION_ERROR',
      status: 400,
    });
    expect(new PrivacyConfigurationError('bad config', { table: 'auth.users' })).toMatchObject({
      code: 'PRIVACY_CONFIGURATION_ERROR',
      status: 500,
    });
    expect(new PrivacyConfigurationError('bad config')).toMatchObject({
      code: 'PRIVACY_CONFIGURATION_ERROR',
      status: 500,
    });
    expect(new PrivacyValidationError('bad input')).toMatchObject({
      code: 'PRIVACY_VALIDATION_ERROR',
      status: 400,
    });
  });

  it('loads database PII rules, auth user defaults, overrides, and validates subject metadata', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stynx-privacy-'));
    mkdirSync(join(root, 'app/privacy'), { recursive: true });
    writeFileSync(join(root, 'app/privacy/pii-map.yaml'), [
      'rules:',
      '  - tableSchema: app',
      '    tableName: customers',
      '    columnName: email',
      '    strategy: tombstone',
      '    subjectColumn: person_id',
      '    notes: override',
      '',
    ].join('\n'));

    const trx = {
      query: vi.fn(async () => ({
        rows: [
          {
            table_schema: 'auth',
            table_name: 'users',
            column_name: 'email',
            strategy: 'nullify',
            category: null,
            notes: null,
          },
          {
            table_schema: 'app',
            table_name: 'customers',
            column_name: 'email',
            strategy: 'nullify',
            category: 'contact',
            notes: null,
          },
        ],
      })),
    };
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (input: typeof trx) => unknown) => fn(trx)),
    };
    const service = new PiiMapService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      { environment: 'test', region: 'us-east-1', appRoot: root },
    );

    try {
      await expect(service.load()).resolves.toEqual([
        expect.objectContaining({
          tableSchema: 'app',
          tableName: 'customers',
          columnName: 'email',
          strategy: 'tombstone',
          subjectColumn: 'person_id',
          notes: 'override',
        }),
        expect.objectContaining({
          tableSchema: 'auth',
          tableName: 'users',
          columnName: 'email',
          subjectColumn: 'id',
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws when loaded PII rules still lack subject metadata', async () => {
    const trx = {
      query: vi.fn(async () => ({
        rows: [{
          table_schema: 'app',
          table_name: 'customers',
          column_name: 'email',
          strategy: 'nullify',
          category: null,
          notes: null,
        }],
      })),
    };
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (input: typeof trx) => unknown) => fn(trx)),
    };
    const service = new PiiMapService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      { environment: 'test', region: 'us-east-1', appRoot: '/missing/root' },
    );

    await expect(service.load()).rejects.toBeInstanceOf(PrivacyConfigurationError);
  });

  it('loads override-only PII rules and falls back to the process working directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stynx-privacy-'));
    mkdirSync(join(root, 'app/privacy'), { recursive: true });
    writeFileSync(join(root, 'app/privacy/pii-map.yaml'), [
      'rules:',
      '  - tableSchema: app',
      '    tableName: customers',
      '    columnName: email',
      '    strategy: nullify',
      '    subjectColumn: person_id',
      '',
    ].join('\n'));
    const query = vi.fn(async () => ({ rows: [] }));
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (input: { query: typeof query }) => unknown) => fn({ query })),
    };
    const service = new PiiMapService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      { environment: 'test', region: 'us-east-1' },
    );

    try {
      vi.spyOn(process, 'cwd').mockReturnValue(root);
      await expect(service.load()).resolves.toEqual([
        expect.objectContaining({
          tableSchema: 'app',
          tableName: 'customers',
          columnName: 'email',
          subjectColumn: 'person_id',
        }),
      ]);
    } finally {
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('renders data-flow metadata when controllers or processors are provided alone', () => {
    expect(generateRopaMarkdown([], { controllers: ['STYNX'] }))
      .toContain('Controllers: STYNX');
    expect(generateRopaMarkdown([], { controllers: ['STYNX'] }))
      .not.toContain('Processors:');
    expect(generateRopaMarkdown([], { processors: ['AWS'] }))
      .toContain('Processors: AWS');
    expect(generateRopaMarkdown([], { processors: ['AWS'] }))
      .not.toContain('Controllers:');
  });

  // ===========================================================================
  // WAVE-05A targeted kills — ropa.ts mutation survivors
  //
  // Pin the exact markdown output line-by-line so StringLiteral mutations on
  // headers, table separators, row templates, and data-flow section labels
  // are caught by string equality.
  // ===========================================================================

  it('emits the exact ROPA header block (kills StringLiteral mutants on lines 15-17)', () => {
    const md = generateRopaMarkdown([], {});
    const lines = md.split('\n');
    expect(lines[0]).toBe('# STYNX ROPA');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('| Table | Column | Strategy | Category | Subject Link | Retention | Notes |');
    expect(lines[3]).toBe('| --- | --- | --- | --- | --- | --- | --- |');
  });

  it('emits ROPA rows with the exact pipe-delimited template (kills StringLiteral mutants on the row builder)', () => {
    // One rule, all optional fields populated; assert the exact row text.
    const md = generateRopaMarkdown([
      {
        tableSchema: 'auth',
        tableName: 'users',
        columnName: 'email',
        strategy: 'hash_with_salt',
        category: 'contact',
        subjectColumn: 'id',
        notes: 'primary email',
        retention: {
          timestampColumn: 'created_at',
          olderThanDays: 30,
          target: 'archive',
        },
      },
    ], { categories: { contact: 'Contact data' } });
    expect(md).toContain(
      '| auth.users | email | hash_with_salt | Contact data | id | archive 30d via created_at | primary email |',
    );
  });

  it('falls back to "both" retention target string when target is undefined', () => {
    const md = generateRopaMarkdown([
      {
        tableSchema: 'app',
        tableName: 'events',
        columnName: 'payload',
        strategy: 'nullify',
        retention: { timestampColumn: 'created_at', olderThanDays: 60 },
      },
    ]);
    // `retention.target ?? 'both'` — kills StringLiteral mutation on 'both'.
    expect(md).toContain('| app.events | payload | nullify | unspecified | unspecified | both 60d via created_at |');
  });

  it('falls back to "unspecified" when category and subjectColumn are absent', () => {
    const md = generateRopaMarkdown([
      {
        tableSchema: 'app',
        tableName: 'events',
        columnName: 'payload',
        strategy: 'nullify',
      },
    ]);
    expect(md).toContain('| app.events | payload | nullify | unspecified | unspecified | none |  |');
  });

  it('falls back to "none" retention literal when rule.retention is undefined', () => {
    // Kills StringLiteral on the 'none' fallback at line 24.
    const md = generateRopaMarkdown([
      {
        tableSchema: 'app',
        tableName: 'events',
        columnName: 'payload',
        strategy: 'nullify',
        category: 'business',
        subjectColumn: 'user_id',
      },
    ]);
    expect(md).toContain('| app.events | payload | nullify | business | user_id | none |  |');
  });

  it('emits "## Data Flow" section header with exact text when controllers OR processors present', () => {
    // Both populated → assert the section header literal and both labels.
    const md = generateRopaMarkdown([], { controllers: ['STYNX', 'Acme'], processors: ['AWS', 'GCP'] });
    expect(md).toContain('## Data Flow');
    expect(md).toContain('Controllers: STYNX, Acme');
    expect(md).toContain('Processors: AWS, GCP');
  });

  it('omits Data Flow section entirely when both controllers and processors are empty arrays', () => {
    // Kills ConditionalExpression "true" mutation on line 31 — forcing it true
    // would emit the section even when both arrays are empty.
    const md = generateRopaMarkdown([], { controllers: [], processors: [] });
    expect(md).not.toContain('## Data Flow');
    expect(md).not.toContain('Controllers:');
    expect(md).not.toContain('Processors:');
  });

  it('omits Data Flow section when controllers/processors are undefined (no metadata key)', () => {
    const md = generateRopaMarkdown([]);
    expect(md).not.toContain('## Data Flow');
  });

  it('emits Data Flow with controllers only when controllers.length > 0 and processors.length === 0', () => {
    // The `?.length ?? 0 > 0` EqualityOperator mutation (>= 0) would emit
    // Processors: with no values; assert the absence.
    const md = generateRopaMarkdown([], { controllers: ['STYNX'], processors: [] });
    expect(md).toContain('Controllers: STYNX');
    expect(md).not.toContain('Processors:');
  });

  it('emits Data Flow with processors only when processors.length > 0 and controllers.length === 0', () => {
    const md = generateRopaMarkdown([], { controllers: [], processors: ['AWS'] });
    expect(md).toContain('Processors: AWS');
    expect(md).not.toContain('Controllers:');
  });

  it('terminates the markdown with a trailing newline (kills StringLiteral mutation on the final empty line)', () => {
    // The `lines.push('')` and `lines.join('\n')` together yield a trailing '\n'.
    const md = generateRopaMarkdown([], {});
    expect(md.endsWith('\n')).toBe(true);
    // The single trailing newline must be the result of the empty-line push,
    // not of any other line in the output.
    expect(md.split('\n').at(-1)).toBe('');
  });

  // ===========================================================================
  // WAVE-05A targeted kills — pii-map.service.ts mutation survivors
  //
  // Tests assert that the Zod identifier validation rejects names violating
  // /^[A-Za-z_][A-Za-z0-9_]*$/u (kills Regex anchor mutants and the
  // MethodExpression mutations that drop .regex(identifierPattern) for a bare
  // .string()), and that the auth/users default-subjectColumn branch fires.
  // ===========================================================================

  function buildPiiMapService(
    rows: Array<{
      table_schema: string;
      table_name: string;
      column_name: string;
      strategy: string;
      category?: string | null;
      notes?: string | null;
    }>,
  ): PiiMapService {
    const trx = {
      query: vi.fn(async () => ({ rows })),
    };
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (input: typeof trx) => unknown) => fn(trx)),
    };
    return new PiiMapService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      { environment: 'test', region: 'us-east-1', appRoot: '/missing/root' },
    );
  }

  it('rejects DB rules whose tableSchema starts with a digit (kills Regex ^ anchor)', async () => {
    // Identifier pattern /^[A-Za-z_][A-Za-z0-9_]*$/u; '1bad' violates ^[A-Za-z_].
    // Removing ^ anchor lets '1bad' through; the zod schema would accept it.
    const service = buildPiiMapService([{
      table_schema: '1bad',
      table_name: 'users',
      column_name: 'email',
      strategy: 'nullify',
      category: null,
      notes: null,
    }]);
    await expect(service.load()).rejects.toThrow();
  });

  it('rejects DB rules whose tableName contains a dash (kills Regex $ anchor + .regex MethodExpression)', async () => {
    // 'user-table' violates the [A-Za-z0-9_]* class. Removing $ anchor lets
    // partial matches through; dropping .regex() entirely lets any string through.
    const service = buildPiiMapService([{
      table_schema: 'app',
      table_name: 'user-table',
      column_name: 'email',
      strategy: 'nullify',
      category: null,
      notes: null,
    }]);
    await expect(service.load()).rejects.toThrow();
  });

  it('rejects DB rules whose columnName contains whitespace', async () => {
    const service = buildPiiMapService([{
      table_schema: 'app',
      table_name: 'users',
      column_name: 'first name',
      strategy: 'nullify',
      category: null,
      notes: null,
    }]);
    await expect(service.load()).rejects.toThrow();
  });

  it('rejects DB rules with an unknown strategy (kills enum MethodExpression mutants)', async () => {
    // The strategy field uses z.enum(['nullify', 'hash_with_salt', ...]).
    // The MethodExpression mutation .enum([...]) → .string() would accept any.
    const service = buildPiiMapService([{
      table_schema: 'app',
      table_name: 'users',
      column_name: 'email',
      strategy: 'not_a_real_strategy',
      category: null,
      notes: null,
    }]);
    await expect(service.load()).rejects.toThrow();
  });

  it('applies the auth/users subjectColumn="id" default (kills ObjectLiteral + LogicalOperator on line 64)', async () => {
    // Without the auth+users fast-path, the rule would lack subjectColumn and
    // throw PrivacyConfigurationError in the validation loop. With it, the
    // rule returns successfully with subjectColumn === 'id'.
    const service = buildPiiMapService([{
      table_schema: 'auth',
      table_name: 'users',
      column_name: 'email',
      strategy: 'nullify',
      category: null,
      notes: null,
    }]);
    const rules = await service.load();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.subjectColumn).toBe('id');
    expect(rules[0]?.tableSchema).toBe('auth');
    expect(rules[0]?.tableName).toBe('users');
  });

  it('does NOT apply the auth/users default when schema differs (kills LogicalOperator || mutation on line 64)', async () => {
    // The condition is `rule.tableSchema === 'auth' && rule.tableName === 'users'`.
    // Mutation '||' would apply the fast-path to any 'users' table or any 'auth' table.
    // app.users has no subjectColumn → triggers the missing-subjectColumn throw.
    const service = buildPiiMapService([{
      table_schema: 'app',
      table_name: 'users',
      column_name: 'email',
      strategy: 'nullify',
      category: null,
      notes: null,
    }]);
    await expect(service.load()).rejects.toThrow(PrivacyConfigurationError);
  });

  it('does NOT apply the auth/users default when table differs (catches the second half of the && condition)', async () => {
    const service = buildPiiMapService([{
      table_schema: 'auth',
      table_name: 'groups',
      column_name: 'name',
      strategy: 'nullify',
      category: null,
      notes: null,
    }]);
    await expect(service.load()).rejects.toThrow(PrivacyConfigurationError);
  });

  it('sorts loaded rules by schema.table.column lexicographically (kills BooleanLiteral mutants on the sort comparator)', async () => {
    // Two rules out of natural order; expect alphabetical output.
    const service = buildPiiMapService([
      {
        table_schema: 'auth', table_name: 'users', column_name: 'phone',
        strategy: 'nullify', category: null, notes: null,
      },
      {
        table_schema: 'auth', table_name: 'users', column_name: 'email',
        strategy: 'nullify', category: null, notes: null,
      },
    ]);
    const rules = await service.load();
    expect(rules.map((r) => r.columnName)).toEqual(['email', 'phone']);
  });

  it('includes the column name in the PrivacyConfigurationError context (kills StringLiteral mutants on lines 103-105)', async () => {
    // Force the validation throw by feeding a rule that won't match auth/users.
    const service = buildPiiMapService([{
      table_schema: 'app',
      table_name: 'orders',
      column_name: 'customer_email',
      strategy: 'nullify',
      category: null,
      notes: null,
    }]);
    try {
      await service.load();
      throw new Error('expected load() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PrivacyConfigurationError);
      // The error carries a context map with 'table' and 'column' keys; those
      // exact values catch StringLiteral mutations on the template strings.
      const ctx = (error as PrivacyConfigurationError).context as Record<string, string>;
      expect(ctx).toEqual({
        table: 'app.orders',
        column: 'customer_email',
      });
    }
  });

  it('delegates privacy object store operations with configured defaults and overrides', async () => {
    const putObject = vi.fn(async () => undefined);
    const presignDownload = vi.fn(async () => 'https://download.example.test');
    vi.mocked(StynxObjectStore).mockImplementation(() => ({
      putObject,
      presignDownload,
    }) as never);

    const service = new PrivacyObjectStoreService({
      environment: 'prod',
      region: 'sa-east-1',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
    });

    await service.putObject({ key: 'exports/1.zip', body: Buffer.from('x'), contentType: 'application/zip' });
    await expect(service.presignDownload({ key: 'exports/1.zip', expiresInSeconds: 60 }))
      .resolves.toBe('https://download.example.test');
    expect(StynxObjectStore).toHaveBeenCalledWith({
      bucketName: 'stynx-privacy-prod',
      region: 'sa-east-1',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
    });
    expect(putObject).toHaveBeenCalledWith(expect.objectContaining({ key: 'exports/1.zip' }));
    expect(presignDownload).toHaveBeenCalledWith({ key: 'exports/1.zip', expiresInSeconds: 60 });

    new PrivacyObjectStoreService({
      environment: 'dev',
      region: 'us-east-1',
      bucketName: 'custom-bucket',
    });
    expect(StynxObjectStore).toHaveBeenLastCalledWith({
      bucketName: 'custom-bucket',
      region: 'us-east-1',
    });
  });
});
