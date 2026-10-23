import { relative, resolve } from 'node:path';
import ts from 'typescript';

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
]);
const legacyCallers = new Set([
  'packages/data/src/query-helpers.ts',
  'packages/data/src/transaction.ts',
  'packages/data/src/internal/archive-relations.ts',
  'packages/data/src/internal/archive-restore.ts',
  'packages/data/src/internal/soft-delete-cascade.ts',
]);
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
  const declarationOrigin = (declaration) => ({
    file: pathOf(declaration.getSourceFile().fileName),
    absoluteFile: normalized(declaration.getSourceFile().fileName),
    name:
      declaration.name && ts.isIdentifier(declaration.name)
        ? declaration.name.text
        : declaration.name && ts.isStringLiteral(declaration.name)
          ? declaration.name.text
          : undefined,
  });
  const origins = (node) => {
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
    inspect(services.esTreeNodeToTSNodeMap.get(node));
    return result;
  };
  return { origins, filename: pathOf(context.filename) };
}

const isDataModule = (origin, module) =>
  origin.file === `packages/data/src/${module}.ts` ||
  origin.file === `packages/data/dist/${module}.d.ts` ||
  (/\/node_modules\/@stynx-nyx\/data\//u.test(origin.absoluteFile) &&
    origin.absoluteFile.endsWith(`/${module}.d.ts`));

const isRawMethod = (origin) => {
  if (!['query', 'execute'].includes(origin.name)) return false;
  if (isDataModule(origin, 'transaction')) return true;
  return (
    origin.name === 'query' &&
    /\/node_modules\/(?:@types\/(?:pg|pg-pool)|pg|pg-pool|pg-native|node-postgres)\//u.test(
      origin.absoluteFile,
    )
  );
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
    },
  },
  create(context) {
    const { origins, filename } = semanticOrigins(context);
    if (filename === executor) return {};
    return {
      CallExpression(node) {
        const declarations = origins(node.callee);
        if (declarations.some(isRawMethod)) {
          context.report({ node, messageId: 'raw' });
          return;
        }
        const denied = declarations.find(
          (origin) =>
            isDataModule(origin, 'checked-executor') &&
            entryCallers.has(origin.name) &&
            !entryCallers.get(origin.name).has(filename),
        );
        if (denied) context.report({ node, messageId: 'entry', data: { name: denied.name } });
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
      interpolation:
        'Typed-query sql literals must have zero interpolations; bind values with placeholders.',
    },
  },
  create(context) {
    const { origins, filename } = semanticOrigins(context);
    return {
      CallExpression(node) {
        if (
          !filename.endsWith('.repository.ts') &&
          origins(node.callee).some(
            (origin) => origin.name === 'defineQuery' && isDataModule(origin, 'typed-query'),
          )
        )
          context.report({ node, messageId: 'location' });
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
