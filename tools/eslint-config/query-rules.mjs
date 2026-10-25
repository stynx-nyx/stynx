import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { createStaticQueryProof } from './query-provenance.mjs';
import { reflectedCallTargets } from './query-reflection.mjs';

const executor = 'packages/data/src/checked-executor.ts';
const scriptCallers = new Set([
  'packages/data/src/migration-runner.ts',
  'packages/cli/src/migrate.ts',
  'packages/cli/engines/rls-negative.mjs',
  'packages/testing/src/create-test-app.ts',
  'packages/testing/src/fixtures.ts',
  'packages/testing/src/lgpd-fixture.ts',
  'packages/outbox/src/storage-cli.ts',
  'packages/offline-sync/src/storage-cli.ts',
  'reference/api/src/app.module.ts',
  'reference/api/src/performance/offline-storage.ts',
]);
const referenceScriptScopes = new Map([
  ['reference/api/src/app.module.ts', ['runReferenceApiMigrations']],
  ['reference/api/src/performance/offline-storage.ts', ['OfflinePerformanceStorageInstaller', 'onApplicationBootstrap']],
]);
const withinReferenceInstaller = (node, names) => {
  const found = new Set();
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'FunctionDeclaration' || parent.type === 'ClassDeclaration') {
      if (parent.id) found.add(parent.id.name);
    } else if (parent.type === 'MethodDefinition' && !parent.computed) {
      found.add(parent.key.name ?? parent.key.value);
    }
  }
  return names.every((name) => found.has(name));
};
const legacyOperationCallers = new Map([
  ['select', 'packages/data/src/query-helpers.ts'],
  ...['hard-delete-live', 'hard-delete-archive'].map((operation) =>
    [operation, 'packages/data/src/transaction.ts']),
  ...['list-child-ids', 'count-blocking-children', 'sample-blocking-children',
    'load-archived-row', 'live-parent-exists', 'archived-parent-exists', 'restore-conflict']
    .map((operation) => [operation, 'packages/data/src/internal/archive-relations.ts']),
  ...['restore-insert', 'restore-delete-archive', 'restore-children'].map((operation) =>
    [operation, 'packages/data/src/internal/archive-restore.ts']),
  ...['soft-delete-insert', 'soft-delete-live'].map((operation) =>
    [operation, 'packages/data/src/internal/soft-delete-cascade.ts']),
]);
const legacyCallers = new Set(legacyOperationCallers.values());
const entryCallers = new Map([
  ['executeRawScript', scriptCallers],
  ['executeLegacyArchive', legacyCallers],
  ['executeCompatibilityQuery', new Set(['packages/data/src/transaction.ts'])],
  ['executeCompatibilityStatement', new Set(['packages/data/src/transaction.ts'])],
  ['executeTransactionControl', new Set(['packages/data/src/database.ts'])],
]);
const optionsSchema = [
  {
    type: 'object',
    properties: { rootDir: { type: 'string' } },
    required: ['rootDir'],
    additionalProperties: false,
  },
];
const normalized = (path) => path.replaceAll('\\', '/');

// Follow declarations, not local spellings or structural method names. A pg
// method keeps its declaration through receiver aliases, Pick<>, destructuring
// and barrel imports, while a search engine's query method remains unrelated.
function semanticOrigins(context) {
  const services = context.sourceCode.parserServices;
  if (!services?.program || !services.esTreeNodeToTSNodeMap) {
    throw new Error('STYNX query rules require TypeScript parser services with a project.');
  }
  const checker = services.program.getTypeChecker();
  const root = resolve(context.options[0].rootDir);
  const pathOf = (file) => normalized(relative(root, resolve(file)));
  const declarationScope = (declaration) => {
    const names = [];
    for (let parent = declaration.parent; parent && !ts.isSourceFile(parent); parent = parent.parent) {
      if (parent.name && ts.isIdentifier(parent.name)) names.push(parent.name.text);
    }
    return names.join('/');
  };
  const declarationOrigin = (declaration) => ({
    file: pathOf(declaration.getSourceFile().fileName),
    absoluteFile: normalized(declaration.getSourceFile().fileName),
    scope: declarationScope(declaration),
    name:
      declaration.name && ts.isIdentifier(declaration.name)
        ? declaration.name.text
        : declaration.name && ts.isStringLiteral(declaration.name)
          ? declaration.name.text
          : undefined,
  });
  const tsOrigins = (node) => {
    const result = [];
    const visited = new Set();
    const inspect = (current) => {
      if (!current || visited.has(current)) return;
      visited.add(current);
      const symbol = checker.getSymbolAtLocation(current);
      const resolved =
        symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      for (const declaration of resolved?.declarations ?? []) {
        result.push(declarationOrigin(declaration));
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          inspect(declaration.initializer);
        }
      }
      const type = checker.getTypeAtLocation(current);
      for (const constituent of type.isUnionOrIntersection() ? type.types : [type]) {
        for (const signature of constituent.getCallSignatures()) {
          const declaration = signature.getDeclaration();
          if (declaration) result.push(declarationOrigin(declaration));
        }
      }
      if (
        ts.isPropertyAccessExpression(current) &&
        ['bind', 'call', 'apply'].includes(current.name.text)
      ) {
        inspect(current.expression);
      }
      if (ts.isCallExpression(current)) inspect(current.expression);
      if (
        ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isNonNullExpression(current)
      ) {
        inspect(current.expression);
      }
    };
    inspect(node);
    return result;
  };
  const origins = (node) => tsOrigins(services.esTreeNodeToTSNodeMap.get(node));
  const trustedTsFunction = (node, module, name) => {
    const visited = new Set();
    const isExpectedFunction = (symbol) => {
      const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol) : symbol;
      return resolved?.declarations?.some((declaration) => {
        const origin = declarationOrigin(declaration);
        return ts.isFunctionDeclaration(declaration) && origin.name === name && isDataModule(origin, module);
      }) ?? false;
    };
    const namespaceImport = (expression) => {
      if (!ts.isIdentifier(expression)) return false;
      return checker.getSymbolAtLocation(expression)?.declarations?.some(ts.isNamespaceImport) ?? false;
    };
    const inspect = (expression) => {
      if (!expression || visited.has(expression)) return false;
      visited.add(expression);
      if (ts.isParenthesizedExpression(expression)) return inspect(expression.expression);
      if (ts.isPropertyAccessExpression(expression)) {
        return namespaceImport(expression.expression) && isExpectedFunction(checker.getSymbolAtLocation(expression.name));
      }
      if (!ts.isIdentifier(expression)) return false;
      const symbol = checker.getSymbolAtLocation(expression);
      const declarations = symbol?.declarations ?? [];
      if (declarations.some(ts.isImportSpecifier)) return isExpectedFunction(symbol);
      return declarations.some((declaration) => {
        if (ts.isFunctionDeclaration(declaration)) return isExpectedFunction(symbol);
        return ts.isVariableDeclaration(declaration) &&
          ts.isVariableDeclarationList(declaration.parent) &&
          Boolean(declaration.parent.flags & ts.NodeFlags.Const) &&
          inspect(declaration.initializer);
      });
    };
    return inspect(node);
  };
  const trustedFunction = (node, module, name) =>
    trustedTsFunction(services.esTreeNodeToTSNodeMap.get(node), module, name);
  return {
    origins, tsOrigins, trustedFunction, trustedTsFunction, checker, pathOf, program: services.program,
    tsNode: (node) => services.esTreeNodeToTSNodeMap.get(node),
    filename: pathOf(context.filename),
  };
}

// TypeScript may resolve a workspace import to source, a pnpm realpath, or
// the nested declaration tree emitted by this repository's package builds.
// Every accepted layout names the exact package and module, never a basename.
const isWorkspaceModule = (origin, packageName, module) => [
  `packages/${packageName}/src/${module}.ts`,
  `packages/${packageName}/dist/${module}.d.ts`,
  `packages/${packageName}/dist/${packageName}/src/${module}.d.ts`,
].includes(origin.file) || [
  `/node_modules/@stynx-nyx/${packageName}/dist/${module}.d.ts`,
  `/node_modules/@stynx-nyx/${packageName}/dist/${packageName}/src/${module}.d.ts`,
].some((path) => origin.absoluteFile.endsWith(path));

const isDataModule = (origin, module) => isWorkspaceModule(origin, 'data', module);

// Explicit declaration census: these are SQL ports even when consumers provide
// only a structural query implementation rather than a pg Client/Transaction.
const rawQueryPorts = [
  ['data', 'checked-executor', 'CheckedQueryClient'],
  ['data', 'checked-executor', 'ConfiguredSqlExecutor'],
  ['data', 'checked-executor', 'ContextualQueryExecutor'],
  ['data', 'checked-executor', 'bindQueryContext'],
  ['data', 'checked-executor', 'createScopedQueryExecutor'],
  ['data', 'storage-contract', 'StorageVerifierTransaction'],
  ['data', 'internal/archive-relations', 'ArchiveRelationContext'],
  ['data', 'internal/archive-restore', 'RestoreContext'],
  ['data', 'internal/soft-delete-cascade', 'SoftDeleteContext'],
  ['idempotency', 'types', 'IdempotencySqlExecutor'],
  ['backend', 'idempotency/types', 'IdempotencySqlExecutor'],
  ['audit', 'sql-adapter', 'SqlExecutor'],
  ['audit', 'test-helpers', 'Queryable'],
  ['contracts', 'audit', 'AuditTransactionExecutor'],
  ['cli', 'audit', 'AuditVerifyClient'],
  ['cli', 'migrate', 'MigrationClient'],
  ['backend', 'auth/sql-tenant-entitlement.fallback', 'TenantEntitlementSqlExecutor'],
  ['backend', 'identity-admin/pg-local-sync.adapter', 'IdentityLocalSyncSqlExecutor'],
  ['backend', 'db-context/pg-session-db-context.applier', 'PgQueryableClient'],
  ['backend', 'rate-limit/types', 'RateLimitSqlExecutor'],
  ['ratelimit', 'types', 'RateLimitSqlExecutor'],
  ['outbox', 'types', 'OutboxSqlExecutor'],
  ['data', 'checked-executor', 'client/executeRawScript'],
  ['data', 'migration-runner', 'client/promoteBootstrapObjectsToOwner/StynxMigrationRunner'],
  ['outbox', 'event-stream-source', 'trx/onPrimary/OutboxEventStreamSource'],
];
const rawReferencePorts = [
  ['reference/api/src/sample/reference-dev-auth.service.ts', 'QueryLike'],
  ['reference/api/src/app.module.ts', 'owner/bootstrapLegacyReferenceMigrationState'],
  ['reference/api/src/app.module.ts', 'connect/pools/runReferenceApiMigrations'],
];

// Inspector's source census binds every callable query/execute declaration to
// a reviewed classification. Renaming/adding a structural SQL port therefore
// requires updating its exact provenance instead of silently escaping lint.
// This module is internal; the published profile factory exports are unchanged.
export const workspaceQueryDeclarationCensus = Object.freeze([
  ...rawQueryPorts.map(([packageName, module, scope]) => ({
    file: `packages/${packageName}/src/${module}.ts`, scope, member: 'query', classification: 'raw-sql',
  })),
  ...rawReferencePorts.map(([file, scope]) => ({ file, scope, member: 'query', classification: 'raw-sql' })),
  ...['query', 'execute'].map((member) => ({
    file: 'packages/data/src/transaction.ts', scope: 'Transaction', member, classification: 'raw-sql',
  })),
  { file: 'packages/data/src/checked-executor.ts', scope: 'db/executeCompatibilityStatement', member: 'execute', classification: 'raw-sql' },
  ...[
    ['packages/jobs/src/jobs.worker.ts', 'JobsWorker'],
    ['packages/sessions/src/control/session-control.service.ts', 'SessionControlService'],
    ['packages/backend/src/transactional-command/transactional-command.ts', 'TransactionalCommandInterceptor'],
    ['packages/signature/src/http-provider-client.ts', 'HttpSignatureProviderClient'],
    ['packages/integration-adapter/src/index.ts', 'IntegrationAdapter'],
    ['packages-web/sdk/src/transport.ts', 'StynxHttpTransport'],
  ].map(([file, scope]) => ({ file, scope, member: 'execute', classification: 'non-sql' })),
  // These exact declarations hold HTTP query dictionaries, not SQL callables.
  // The conservative source census also visits named TypeReferenceNode fields.
  ...[
    ['packages-web/angular-audit/src/audit-api.service.ts', 'SdkRequestOptions'],
    ['packages-web/angular-iam/src/iam-api.service.ts', 'SdkRequestOptions'],
    ['packages-web/angular-flow/src/flow-api.service.ts', 'options'],
    ['packages-web/sdk/src/http.ts', 'ApiRequestOptions'],
    ['packages-web/sdk/src/generated/core/ApiRequestOptions.ts', 'ApiRequestOptions'],
    ['packages-web/sdk/src/generated/compositions/offline-ctg9/core/ApiRequestOptions.ts', 'ApiRequestOptions'],
    ['packages/privacy/src/privacy-retention.guard.ts', 'request/canActivate/PrivacyRetentionPermissionGuard'],
  ].map(([file, scope]) => ({ file, scope, member: 'query', classification: 'non-sql' })),
  { file: 'packages/data/src/query-helpers.ts', scope: 'ArchiveSelectQuery', member: 'execute', classification: 'checked-archive' },
].map((entry) => Object.freeze(entry)));

const configuredOperationCallers = new Map([
  ...['idempotency.lookup', 'idempotency.reserve', 'idempotency.complete', 'idempotency.clear']
    .map((operation) => [operation, new Set([
      'packages/idempotency/src/pg-idempotency.store.ts',
      'packages/backend/src/idempotency/pg-idempotency.store.ts',
    ])]),
  ...['testing.archive-count', 'testing.live-count'].map((operation) =>
    [operation, new Set(['packages/testing/src/matchers.ts'])]),
  ['catalog.foreign-key-orphans', new Set([
    'packages/offline-sync/src/storage.ts', 'packages/outbox/src/storage.ts',
  ])],
  ['offline.import-tenant-present', new Set(['packages/offline-sync/src/import-state.ts'])],
  ['offline.import-foreign-key-orphans', new Set(['packages/offline-sync/src/import-preflight.ts'])],
  ['ratelimit.consume', new Set(['packages/ratelimit/src/pg-rate-limit.store.ts'])],
  ...['ratelimit.increment', 'ratelimit.cleanup'].map((operation) =>
    [operation, new Set(['packages/backend/src/rate-limit/pg-rate-limit.store.ts'])]),
  ['auth.tenant-entitlement', new Set(['packages/backend/src/auth/sql-tenant-entitlement.fallback.ts'])],
  ['identity.role-metadata', new Set(['packages/backend/src/identity-admin/pg-local-sync.adapter.ts'])],
  ...[
    'outbox.legacy-retry-state', 'outbox.legacy-ack-target', 'outbox.legacy-record-ack',
    'outbox.legacy-enqueue', 'outbox.legacy-get-one', 'outbox.legacy-claim-due',
    'outbox.legacy-fail', 'outbox.legacy-acked-row', 'outbox.legacy-retry', 'outbox.legacy-ack',
  ].map((operation) =>
    [operation, new Set(['packages/outbox/src/outbox.service.ts'])]),
// BEGIN GENERATED audit-porm32 admissions
  ['audit.read-porm.mask.0', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.1', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.2', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.3', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.4', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.5', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.6', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.7', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.8', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.9', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.10', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.11', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.12', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.13', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.14', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.15', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.16', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.17', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.18', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.19', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.20', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.21', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.22', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.23', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.24', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.25', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.26', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.27', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.28', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.29', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.30', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-porm.mask.31', new Set(['packages/audit/src/sql-adapter.ts'])],
// END GENERATED audit-porm32 admissions

// BEGIN GENERATED audit-remaining512 log-admissions
  ['audit.read-log.mask.0', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.1', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.2', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.3', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.4', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.5', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.6', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.7', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.8', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.9', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.10', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.11', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.12', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.13', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.14', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.15', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.16', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.17', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.18', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.19', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.20', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.21', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.22', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.23', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.24', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.25', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.26', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.27', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.28', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.29', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.30', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.31', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.32', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.33', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.34', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.35', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.36', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.37', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.38', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.39', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.40', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.41', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.42', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.43', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.44', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.45', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.46', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.47', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.48', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.49', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.50', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.51', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.52', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.53', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.54', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.55', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.56', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.57', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.58', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.59', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.60', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.61', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.62', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.63', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.64', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.65', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.66', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.67', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.68', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.69', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.70', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.71', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.72', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.73', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.74', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.75', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.76', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.77', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.78', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.79', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.80', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.81', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.82', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.83', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.84', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.85', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.86', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.87', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.88', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.89', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.90', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.91', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.92', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.93', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.94', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.95', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.96', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.97', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.98', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.99', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.100', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.101', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.102', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.103', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.104', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.105', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.106', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.107', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.108', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.109', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.110', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.111', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.112', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.113', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.114', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.115', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.116', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.117', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.118', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.119', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.120', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.121', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.122', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.123', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.124', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.125', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.126', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-log.mask.127', new Set(['packages/audit/src/sql-adapter.ts'])],
// END GENERATED audit-remaining512 log-admissions

// BEGIN GENERATED audit-remaining512 events-admissions
  ['audit.read-events.mask.0', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.1', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.2', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.3', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.4', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.5', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.6', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.7', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.8', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.9', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.10', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.11', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.12', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.13', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.14', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.15', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.16', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.17', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.18', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.19', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.20', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.21', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.22', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.23', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.24', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.25', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.26', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.27', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.28', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.29', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.30', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.31', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.32', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.33', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.34', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.35', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.36', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.37', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.38', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.39', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.40', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.41', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.42', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.43', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.44', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.45', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.46', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.47', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.48', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.49', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.50', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.51', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.52', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.53', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.54', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.55', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.56', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.57', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.58', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.59', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.60', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.61', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.62', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.63', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.64', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.65', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.66', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.67', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.68', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.69', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.70', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.71', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.72', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.73', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.74', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.75', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.76', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.77', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.78', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.79', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.80', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.81', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.82', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.83', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.84', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.85', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.86', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.87', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.88', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.89', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.90', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.91', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.92', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.93', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.94', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.95', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.96', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.97', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.98', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.99', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.100', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.101', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.102', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.103', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.104', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.105', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.106', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.107', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.108', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.109', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.110', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.111', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.112', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.113', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.114', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.115', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.116', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.117', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.118', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.119', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.120', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.121', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.122', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.123', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.124', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.125', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.126', new Set(['packages/audit/src/sql-adapter.ts'])],
  ['audit.read-events.mask.127', new Set(['packages/audit/src/sql-adapter.ts'])],
// END GENERATED audit-remaining512 events-admissions

  ['audit.write-table', new Set(['packages/audit/src/sql-adapter.ts'])],
  ...['audit.partition-retention', 'audit.partition-detach', 'audit.partition-drop'].map((operation) =>
    [operation, new Set(['packages/audit/src/audit.service.ts'])]),
  ...[
    'privacy.retention-count', 'privacy.retention-delete', 'privacy.export',
    'privacy.erasure-delete', 'privacy.erasure-null', 'privacy.erasure-replace',
  ].map((operation) => [operation, new Set(['packages/privacy/src/privacy.service.ts'])]),
]);

const isRawMethod = (origin) => {
  if (!['query', 'execute'].includes(origin.name)) return false;
  if (origin.scope === 'Transaction' && isDataModule(origin, 'transaction')) return true;
  if (origin.name === 'execute') {
    return origin.scope === 'db/executeCompatibilityStatement' && isDataModule(origin, 'checked-executor');
  }
  if (rawQueryPorts.some(([packageName, module, scope]) =>
    origin.scope === scope && isWorkspaceModule(origin, packageName, module),
  ) || rawReferencePorts.some(([file, scope]) => origin.file === file && origin.scope === scope)) return true;
  return /\/node_modules\/(?:@types\/(?:pg|pg-pool)|pg|pg-pool|pg-native|node-postgres)\//u.test(origin.absoluteFile);
};

export const noRawQuery = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Route workspace PostgreSQL execution through the single checked executor.',
    },
    schema: optionsSchema,
    messages: {
      raw: 'Raw PostgreSQL/Transaction execution belongs only in the checked executor; use Transaction.run with a repository query.',
      entry: '{{name}} is not admitted from this source file.',
      operation: 'Compatibility SQL requires a literal reviewed operation admitted for this exact caller.',
      definition: 'Typed execution requires a proven static repository definition: {{reason}}.',
    },
  },
  create(context) {
    const semantics = semanticOrigins(context);
    const { origins, filename } = semantics;
    if (filename === executor) return {};
    const staticQuery = createStaticQueryProof(semantics, isDataModule);
    return {
      CallExpression(node) {
        const reflected = reflectedCallTargets(semantics.tsNode(node), semantics)
          .flatMap(semantics.tsOrigins);
        const declarations = [...origins(node.callee), ...reflected];
        if (declarations.some(isRawMethod)) {
          context.report({ node, messageId: 'raw' });
          return;
        }
        const typedEntry = declarations.find((origin) =>
          (isDataModule(origin, 'checked-executor') &&
            ['executeTypedQuery', 'executeTypedQueryResult', 'executeTypedCommand', 'executeGuardedQueryRows'].includes(origin.name)) ||
          (isDataModule(origin, 'transaction') && origin.scope === 'Transaction' &&
            ['run', 'runGuarded'].includes(origin.name)),
        );
        if (typedEntry) {
          const result = staticQuery(semantics.tsNode(node), typedEntry);
          if (!result.ok) context.report({ node, messageId: 'definition', data: { reason: result.reason } });
          return;
        }
        const denied = declarations.find(
          (origin) =>
            isDataModule(origin, 'checked-executor') &&
            entryCallers.has(origin.name) &&
            (!entryCallers.get(origin.name).has(filename) ||
              (origin.name === 'executeRawScript' && referenceScriptScopes.has(filename) &&
                !withinReferenceInstaller(node, referenceScriptScopes.get(filename)))),
        );
        if (denied) {
          context.report({ node, messageId: 'entry', data: { name: denied.name } });
          return;
        }
        const compatibility = declarations.find((origin) =>
          isDataModule(origin, 'checked-executor') &&
          ['executeConfiguredQuery', 'executeLegacyArchive'].includes(origin.name),
        );
        if (compatibility) {
          const operation = node.arguments[1];
          const admitted = operation?.type === 'Literal' && typeof operation.value === 'string' &&
            (compatibility.name === 'executeConfiguredQuery'
              ? configuredOperationCallers.get(operation.value)?.has(filename)
              : legacyOperationCallers.get(operation.value) === filename);
          if (!admitted) context.report({ node, messageId: 'operation' });
        }
      },
    };
  },
};

export const defineQueryLocation = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep static typed-query definitions in repository modules.' },
    schema: optionsSchema,
    messages: {
      location: 'defineQuery definitions belong in *.repository.ts files.',
      literal: 'defineQuery requires explicit object options with a trusted zero-hole sql literal as text, without spreads.',
      sqlCall: 'Use sql as a zero-hole template tag; ordinary function calls cannot establish literal SQL.',
      interpolation:
        'Typed-query sql literals must have zero interpolations; bind values with placeholders.',
    },
  },
  create(context) {
    const { origins, trustedFunction, filename } = semanticOrigins(context);
    return {
      CallExpression(node) {
        const declarations = origins(node.callee);
        if (declarations.some((origin) => origin.name === 'sql' && isDataModule(origin, 'typed-query'))) {
          context.report({ node, messageId: 'sqlCall' });
          return;
        }
        if (!declarations.some((origin) => origin.name === 'defineQuery' && isDataModule(origin, 'typed-query'))) return;
        if (!filename.endsWith('.repository.ts')) {
          context.report({ node, messageId: 'location' });
          return;
        }
        const options = node.arguments[0];
        const textProperties = options?.type === 'ObjectExpression'
          ? options.properties.filter((property) => property.type === 'Property' &&
              !property.computed && (property.key.name ?? property.key.value) === 'text')
          : [];
        const text = textProperties.length === 1 && textProperties[0].kind === 'init'
          ? textProperties[0].value
          : undefined;
        if (node.arguments.length !== 1 || options?.type !== 'ObjectExpression' ||
            options.properties.some((property) => property.type === 'SpreadElement' || property.computed) ||
            text?.type !== 'TaggedTemplateExpression' || text.quasi.expressions.length !== 0 ||
            !trustedFunction(text.tag, 'typed-query', 'sql')) {
          context.report({ node, messageId: 'literal' });
        }
      },
      TaggedTemplateExpression(node) {
        if (
          node.quasi.expressions.length > 0 &&
          origins(node.tag).some(
            (origin) => origin.name === 'sql' && isDataModule(origin, 'typed-query'),
          )
        )
          context.report({ node, messageId: 'interpolation' });
      },
    };
  },
};
