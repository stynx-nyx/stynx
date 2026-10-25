import ts from 'typescript';

/** @typedef {import('typescript').Node} TsNode */
/** @typedef {import('./query-rules.mjs').QuerySemantics} QuerySemantics */

const catalogFiles = new Map([
  ['scripts/offline-storage-catalog-generate.mjs', 'offline'],
  ['scripts/outbox-storage-catalog-generate.mjs', 'outbox'],
]);
const demoFile = 'scripts/lib/demo-bookmark-storage.mjs';
const templateFile = 'scripts/ci-local/prepare-int-template.mjs';

export const rootToolingScriptFiles = new Set([...catalogFiles.keys(), demoFile]);

// Compare syntax tokens, retaining literal contents and executable operators.
// Formatting and comments are immaterial; dead-code copies do not satisfy an
// expected AST position. Symbol checks below also bind imported/local names.
/** @param {string} text */
function tokens(text) {
  // Parse before walking tokens so template tails and regular expressions are
  // lexed in their syntactic context. A standalone scanner cannot distinguish
  // a template's closing brace from an ordinary block boundary.
  const source = ts.createSourceFile('admission.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  /** @type {string[]} */
  const result = [];
  /** @param {TsNode} node @returns {void} */
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JSDocComment || node.kind === ts.SyntaxKind.EndOfFileToken) return;
    const children = node.getChildren(source);
    if (children.length === 0) result.push(`${node.kind}:${node.getText(source)}`);
    else children.forEach(visit);
  };
  visit(source);
  return result.join('\n');
}
/** @param {TsNode | undefined} node @param {string} expected */
const shape = (node, expected) => node !== undefined && tokens(node.getText()) === tokens(expected);
/** @param {TsNode} node */
const isConst = (node) => ts.isVariableDeclaration(node) &&
  ts.isVariableDeclarationList(node.parent) && Boolean(node.parent.flags & ts.NodeFlags.Const);
/** @param {TsNode | undefined} node @param {string} value */
const str = (node, value) => node !== undefined && ts.isStringLiteral(node) && node.text === value;

/** Exact ADR0040 caller/origin proof; no general raw-script or SQL admission. */
/** @param {QuerySemantics} semantics */
export function createRootToolingProof(semantics) {
  const { checker, filename, pathOf, program } = semantics;
  /** @param {TsNode | undefined} node */
  const declaration = (node) => {
    if (!node || !ts.isIdentifier(node)) return undefined;
    const declarations = checker.getSymbolAtLocation(node)?.declarations;
    return declarations?.length === 1 ? declarations[0] : undefined;
  };
  /** @param {TsNode | undefined} node @param {string} module @param {string} member */
  const imported = (node, module, member) => {
    const binding = declaration(node);
    return binding && ts.isImportSpecifier(binding) &&
      (binding.propertyName ?? binding.name).text === member &&
      ts.isImportDeclaration(binding.parent.parent.parent) &&
      str(binding.parent.parent.parent.moduleSpecifier, module);
  };
  /** @param {TsNode | undefined} node @param {string} name */
  const named = (node, name) => node !== undefined && ts.isIdentifier(node) && node.text === name;
  /** @param {TsNode} node */
  const source = (node) => node.getSourceFile();
  /** @param {TsNode} node @param {string} name */
  const builtin = (node, name) => {
    if (!named(node, name)) return false;
    const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
    return declarations.length > 0 && declarations.every((binding) =>
      program.isSourceFileDefaultLibrary(binding.getSourceFile()));
  };
  /** @param {TsNode} node */
  const nodeUrlGlobal = (node) => {
    if (!named(node, 'URL')) return false;
    const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
    return declarations.length > 0 && declarations.every((binding) =>
      (ts.isVariableDeclaration(binding) || ts.isInterfaceDeclaration(binding)) &&
      named(binding.name, 'URL') && binding.getSourceFile().isDeclarationFile &&
      binding.getSourceFile().fileName.replaceAll('\\', '/').endsWith('/node_modules/@types/node/url.d.ts'));
  };
  /** @param {TsNode | undefined} a @param {TsNode | undefined} b */
  const same = (a, b) => a !== undefined && b !== undefined && ts.isIdentifier(a) && ts.isIdentifier(b) &&
    checker.getSymbolAtLocation(a) === checker.getSymbolAtLocation(b);
  /** @param {TsNode | undefined} node @param {string} name @param {string} initializer @param {TsNode} owner */
  const constBinding = (node, name, initializer, owner) => {
    const binding = declaration(node);
    return binding && ts.isVariableDeclaration(binding) && isConst(binding) && named(binding.name, name) &&
      binding.parent.parent.parent === owner && shape(binding.initializer, initializer)
      ? binding : undefined;
  };
  /** @param {import('typescript').SourceFile} file @param {string} name @param {string} initializer */
  const topBinding = (file, name, initializer) => {
    const declarations = file.statements.flatMap((statement) =>
      ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []);
    const matches = declarations.filter((node) => named(node.name, name));
    const found = matches.length === 1 ? matches[0] : undefined;
    return found && isConst(found) && shape(found.initializer, initializer) ? found : undefined;
  };
  /** @param {import('typescript').SourceFile} file @param {readonly (readonly [string, string, string])[]} expected */
  const importedNames = (file, expected) => expected.every(([local, module, member]) =>
    file.statements.some((statement) => ts.isImportDeclaration(statement) &&
      str(statement.moduleSpecifier, module) && statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some((element) =>
        element.name.text === local && (element.propertyName ?? element.name).text === member)));
  /** @param {TsNode} node */
  const enclosingFunction = (node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isFunctionLike(parent)) return parent;
    }
    return undefined;
  };
  /** @param {import('typescript').CallExpression} call */
  const statementOf = (call) => ts.isAwaitExpression(call.parent) &&
    ts.isExpressionStatement(call.parent.parent) ? call.parent.parent : undefined;
  /** @param {import('typescript').SourceFile} file */
  const canonicalRoot = (file) => {
    const root = topBinding(file, 'root', "resolve(dirname(fileURLToPath(import.meta.url)), '..')");
    const dir = topBinding(file, 'dir', "resolve(root, 'packages/data/migrations/platform')");
    if (!root || !dir) return undefined;
    const rootResolve = root.initializer;
    if (!rootResolve || !ts.isCallExpression(rootResolve)) return undefined;
    const rootDirname = rootResolve.arguments[0];
    if (!rootDirname || !ts.isCallExpression(rootDirname)) return undefined;
    const rootFileUrl = rootDirname.arguments[0];
    if (!rootFileUrl || !ts.isCallExpression(rootFileUrl) || !dir.initializer || !ts.isCallExpression(dir.initializer)) return undefined;
    if (!imported(rootResolve.expression, 'node:path', 'resolve') ||
        !imported(rootDirname.expression, 'node:path', 'dirname') ||
        !imported(rootFileUrl.expression, 'node:url', 'fileURLToPath') ||
        !imported(dir.initializer.expression, 'node:path', 'resolve') ||
        !same(dir.initializer.arguments[0], root.name)) return undefined;
    return importedNames(file, [
      ['resolve', 'node:path', 'resolve'], ['dirname', 'node:path', 'dirname'],
      ['fileURLToPath', 'node:url', 'fileURLToPath'], ['readFileSync', 'node:fs', 'readFileSync'],
      ['readdirSync', 'node:fs', 'readdirSync'], ['createHash', 'node:crypto', 'createHash'],
    ]) ? { root, dir } : undefined;
  };
  /** @param {import('typescript').CallExpression} call */
  const catalogContext = (call) => {
    const file = source(call);
    if (!catalogFiles.has(filename) || enclosingFunction(call)) return undefined;
    const database = topBinding(file, 'database', "`stynx_storage_generation_${randomUUID().replaceAll('-', '')}`");
    const config = topBinding(file, 'config', `{
      host: process.env.STYNX_TEST_PG_HOST ?? process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp',
      user: process.env.STYNX_TEST_PG_USER ?? userInfo().username,
      port: Number(process.env.STYNX_TEST_PG_PORT ?? '5432'),
      password: process.env.STYNX_TEST_PG_PASSWORD,
    }`);
    const admin = topBinding(file, 'admin', "createStynxPgClient({ ...config, database: 'postgres' })");
    if (!database || !config || !admin || !importedNames(file, [
      ['randomUUID', 'node:crypto', 'randomUUID'], ['userInfo', 'node:os', 'userInfo'],
      ['createStynxPgClient', '../packages/data/dist/data/src/index.js', 'createStynxPgClient'],
    ])) return undefined;
    const outer = file.statements.filter(ts.isTryStatement);
    if (outer.length !== 1) return undefined;
    const controller = outer[0];
    if (!controller) return undefined;
    const position = file.statements.indexOf(controller);
    if (!shape(file.statements[position - 2], 'await admin.connect();') ||
        !shape(file.statements[position - 1], 'let client;')) return undefined;
    const body = controller.tryBlock.statements;
    const family = catalogFiles.get(filename);
    if (!shape(body[0], `await executeRootDatabaseOperation(admin, '${family}-catalog-create', database);`) ||
        !shape(body[1], 'client = createStynxPgClient({ ...config, database });') ||
        !shape(body[2], 'await client.connect();') ||
        !shape(body[3], 'const sources = [];') ||
        !shape(controller.finallyBlock, `{ if (client) await client.end();
          await executeRootDatabaseOperation(admin, '${family}-catalog-drop-force', database);
          await admin.end(); }`)) return undefined;
    return { file, database, admin, controller, body };
  };
  /** @param {import('typescript').CallExpression} call @param {string} expected */
  const catalogDatabase = (call, expected) => {
    const context = catalogContext(call);
    if (!context || !same(call.arguments[0], context.admin.name) ||
        !same(call.arguments[2], context.database.name)) return false;
    const statement = statementOf(call);
    return expected.endsWith('-create')
      ? context.body[0] === statement
      : context.controller.finallyBlock?.statements[1] === statement;
  };
  /** @param {import('typescript').CallExpression} call */
  const platformScript = (call) => {
    const statement = statementOf(call);
    const block = statement?.parent;
    const loop = block?.parent;
    if (!block || !ts.isBlock(block) || !loop || !ts.isForOfStatement(loop) ||
        !ts.isVariableDeclarationList(loop.initializer) ||
        !(loop.initializer.flags & ts.NodeFlags.Const) ||
        loop.initializer.declarations.length !== 1 || block.statements.length !== 4 ||
        block.statements[2] !== statement || enclosingFunction(call)) return false;
    const binding = loop.initializer.declarations[0];
    if (!binding || !named(binding.name, 'file') || !shape(loop.expression,
      "readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()")) return false;
    const context = catalogContext(call);
    if (!context || context.body[4] !== loop) return false;
    const file = source(call);
    const roots = canonicalRoot(file);
    const sql = constBinding(call.arguments[1], 'sql', "readFileSync(resolve(dir, file), 'utf8')", block);
    if (!roots || !sql || sql.parent.parent !== block.statements[0]) return false;
    const read = sql.initializer;
    if (!read || !ts.isCallExpression(read)) return false;
    const resolved = read.arguments[0];
    if (!resolved || !ts.isCallExpression(resolved)) return false;
    if (!imported(read.expression, 'node:fs', 'readFileSync') ||
        !imported(resolved.expression, 'node:path', 'resolve') ||
        !same(resolved.arguments[0], roots.dir.name) || !same(resolved.arguments[1], binding.name)) return false;
    return shape(block.statements[1], `sources.push({
      path: \`packages/data/migrations/platform/\${file}\`,
      sha256: createHash('sha256').update(sql).digest('hex'),
    });`) &&
      shape(statement, 'await executeRawScript(client, sql);') &&
      shape(block.statements[3], "if (file === '0002_extensions.sql') await executeTypedQuery(client, catalogSetOwner, []);");
  };
  /** @param {import('typescript').CallExpression} call */
  const offlineTemplateScript = (call) => {
    if (filename !== 'scripts/offline-storage-catalog-generate.mjs' || enclosingFunction(call)) return false;
    const statement = statementOf(call);
    const loop = statement?.parent;
    if (!loop || !ts.isForOfStatement(loop) || !ts.isVariableDeclarationList(loop.initializer) ||
        !(loop.initializer.flags & ts.NodeFlags.Const) || loop.initializer.declarations.length !== 1 ||
        !same(call.arguments[1], loop.initializer.declarations[0]?.name) ||
        !ts.isPropertyAccessExpression(loop.expression) ||
        !['objects', 'bindings'].includes(loop.expression.name.text) ||
        !imported(loop.expression.expression, '../packages/offline-sync/src/storage-template.generated.ts', 'OFFLINE_STORAGE_TEMPLATE') ||
        !shape(statement, 'await executeRawScript(client, sql);')) return false;
    const context = catalogContext(call);
    const block = loop.parent;
    if (!context || context.body[6] !== block.parent || !ts.isBlock(block) || !ts.isTryStatement(block.parent) || block.parent.tryBlock !== block ||
        block.statements.length !== 3) return false;
    return shape(block.statements[0], 'for (const sql of OFFLINE_STORAGE_TEMPLATE.objects) await executeRawScript(client, sql);') &&
      shape(block.statements[1], 'for (const sql of OFFLINE_STORAGE_TEMPLATE.bindings) await executeRawScript(client, sql);') &&
      shape(block.statements[2], 'await executeTypedQuery(client, catalogCommit, []);') &&
      named(block.parent.catchClause?.variableDeclaration?.name, 'error') &&
      shape(block.parent.catchClause?.block, '{ await executeTypedQuery(client, catalogRollback, []); throw error; }') &&
      (ts.isBlock(block.parent.parent) || ts.isSourceFile(block.parent.parent)) &&
      block.parent.parent.statements.some((node, index, all) => node === block.parent &&
        shape(all[index - 1], 'await executeTypedQuery(client, catalogBegin, []);'));
  };
  /** @param {import('typescript').CallExpression} call */
  const demoScript = (call) => {
    if (filename !== demoFile || call.arguments.length !== 2 ||
        !call.arguments[1] || !ts.isPropertyAccessExpression(call.arguments[1]) || call.arguments[1].name.text !== 'sql') return false;
    const fn = enclosingFunction(call);
    if (!fn || !ts.isFunctionDeclaration(fn) || fn.name?.text !== 'installDemoBookmarkStorage' ||
        fn.parent !== source(call) || !fn.body || fn.parameters.length !== 1 ||
        !same(call.arguments[0], fn.parameters[0]?.name) ||
        statementOf(call)?.parent !== fn.body) return false;
    const plan = constBinding(call.arguments[1].expression, 'plan', 'renderDemoBookmarkStorage()', fn.body);
    if (!plan || !plan.initializer || !ts.isCallExpression(plan.initializer) || plan.parent.parent !== fn.body.statements[0]) return false;
    const renderer = declaration(plan.initializer.expression);
    if (!renderer || !ts.isFunctionDeclaration(renderer) || renderer.parameters.length !== 0 || renderer.name?.text !== 'renderDemoBookmarkStorage' ||
        pathOf(renderer.getSourceFile().fileName) !== demoFile || !renderer.body) return false;
    // Require the actual fixed-source renderer and all its original refusal
    // predicates at their executable positions, not a similarly typed facade.
    const file = source(call);
    const fixedSources = topBinding(file, 'sources', `Object.freeze([
      Object.freeze({ path: 'domain/demo-bookmark/db/migration.sql', sha256: '145069ed896859e83627fadeb9d441750799d455ec31d5d650d008b4f928eacc', }),
      Object.freeze({ path: 'domain/demo-bookmark/db/0002_tenant_rls.sql', sha256: '4d9f356d3d406c14a89b2935535da6a300c794533a9ad68726f4d6f176afaf34', }),
    ])`);
    const digest = topBinding(file, 'digest', "(bytes) => createHash('sha256').update(bytes).digest('hex')");
    const body = renderer.body.statements;
    if (!fixedSources || !digest || body.length !== 5 ||
        !fixedSources.initializer || !ts.isCallExpression(fixedSources.initializer) ||
        !ts.isPropertyAccessExpression(fixedSources.initializer.expression) ||
        !builtin(fixedSources.initializer.expression.expression, 'Object')) return false;
    // The reviewed renderer's exact statements below also bind these two
    // ambient constructors. A same-spelled local facade cannot prove origin.
    const bodyBindingsAreOriginal = () => {
      const bodies = body[0];
      if (!bodies || !ts.isVariableStatement(bodies)) return false;
      const mapper = bodies.declarationList.declarations[0]?.initializer;
      if (!mapper || !ts.isCallExpression(mapper)) return false;
      const callback = mapper.arguments[0];
      if (!callback || !ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) return false;
      const path = callback.body.statements[0];
      if (!path || !ts.isVariableStatement(path)) return false;
      const convert = path.declarationList.declarations[0]?.initializer;
      if (!convert || !ts.isCallExpression(convert)) return false;
      const url = convert.arguments[0];
      if (!url || !ts.isNewExpression(url) || !nodeUrlGlobal(url.expression)) return false;
      const returned = body[4];
      return returned !== undefined && ts.isReturnStatement(returned) && returned.expression &&
        ts.isCallExpression(returned.expression) && ts.isPropertyAccessExpression(returned.expression.expression) &&
        builtin(returned.expression.expression.expression, 'Object');
    };
    return bodyBindingsAreOriginal() && shape(body[0], `const bodies = sources.map((source) => {
      const path = fileURLToPath(new URL(\`../../\${source.path}\`, import.meta.url));
      if (!lstatSync(path).isFile() || realpathSync(path) !== path) {
        throw new Error('Demo bookmark migration source is not a real fixed file');
      }
      const bytes = readFileSync(path);
      if (digest(bytes) !== source.sha256) throw new Error('Demo bookmark migration source differs');
      return bytes.toString('utf8');
    });`) && shape(body[1], `if (bodies[1] === undefined || !bodies[1].includes('\\nBEGIN;\\n') || !bodies[1].endsWith('\\nCOMMIT;\\n')) {
      throw new Error('Demo bookmark forward migration transaction framing differs');
    }`) && shape(body[2], "const forward = bodies[1].replace('\\nBEGIN;\\n', '\\n').slice(0, -'COMMIT;\\n'.length);") &&
      shape(body[3], 'const sql = `${bodies[0]}\\n${forward}`;') &&
      shape(body[4], 'return Object.freeze({ contractVersion, sources, sql, renderedSqlSha256: digest(sql), historicalModelDifferences, });') &&
      importedNames(file, [
        ['lstatSync', 'node:fs', 'lstatSync'], ['realpathSync', 'node:fs', 'realpathSync'],
        ['readFileSync', 'node:fs', 'readFileSync'], ['fileURLToPath', 'node:url', 'fileURLToPath'],
        ['createHash', 'node:crypto', 'createHash'],
      ]) && shape(statementOf(call), 'await executeRawScript(queryable, plan.sql);');
  };
  /** @param {import('typescript').CallExpression} call @param {string} operation */
  const templateDatabase = (call, operation) => {
    if (filename !== templateFile || !shape(call.arguments[2], 'String(args.template)') ||
        !call.arguments[2] || !ts.isCallExpression(call.arguments[2]) ||
        !builtin(call.arguments[2].expression, 'String')) return false;
    const fn = enclosingFunction(call);
    if (!fn || !ts.isFunctionDeclaration(fn) || fn.name?.text !== 'main' || fn.parameters.length !== 0 || !fn.body || fn.parent !== source(call)) return false;
    const argument = call.arguments[2].arguments[0];
    if (!argument || !ts.isPropertyAccessExpression(argument)) return false;
    const args = constBinding(argument.expression, 'args', 'parseArgs(process.argv.slice(2))', fn.body);
    if (!args || !args.initializer || !ts.isCallExpression(args.initializer) || args.parent.parent !== fn.body.statements[0]) return false;
    const statements = fn.body.statements;
    const startup = [
      'const args = parseArgs(process.argv.slice(2));',
      'const settings = connectionSettings();',
      'ensureCliBuilt();',
      'ensureDatabaseToolingBuilt();',
      "const { createStynxPgClient, executeTypedQuery } = await import('../../packages/data/dist/data/src/index.js');",
      "const { executeRootDatabaseOperation } = await import('../../packages/data/dist/data/src/checked-executor.js');",
      "const { terminateTemplateConnections } = await import('../../tools/database-tooling/dist/catalog-control.repository.js');",
      "const admin = createStynxPgClient(adminClientConfig(settings, 'postgres'));",
      'await admin.connect();',
    ];
    if (!startup.every((expected, index) => shape(statements[index], expected))) return false;
    const adminStatement = statements[7];
    if (!adminStatement || !ts.isVariableStatement(adminStatement) ||
        !same(call.arguments[0], adminStatement.declarationList.declarations[0]?.name)) return false;
    const parse = declaration(args.initializer.expression);
    if (!parse || !ts.isFunctionDeclaration(parse) || parse.parent !== source(call) || parse.parameters.length !== 1 ||
        !named(parse.parameters[0]?.name, 'argv') ||
        !shape(parse.body, `{
          let template = DEFAULT_TEMPLATE;
          let githubEnv;
          for (let i = 0; i < argv.length; i += 1) {
            if (argv[i] === '--template') { template = argv[i + 1]; i += 1; }
            else if (argv[i] === '--github-env') { githubEnv = argv[i + 1]; i += 1; }
            else { throw new Error(\`Unknown argument: \${argv[i]}\`); }
          }
          if (!/^[a-z_][a-z0-9_]*$/.test(String(template))) {
            throw new Error(\`Invalid template database name: \${template}\`);
          }
          return { template, githubEnv };
        }`) || !topBinding(source(call), 'DEFAULT_TEMPLATE', "'stynx_int_tpl'")) return false;
    const statement = statementOf(call);
    const block = statement?.parent;
    if (!block || !ts.isBlock(block) || !ts.isTryStatement(block.parent) ||
        block.parent.tryBlock !== block || block.parent !== statements[9] || block.statements.length !== 3) return false;
    return shape(block.statements[0], 'await executeTypedQuery(admin, terminateTemplateConnections, [args.template]);') &&
      shape(block.statements[1], "await executeRootDatabaseOperation(admin, 'integration-template-drop', String(args.template));") &&
      shape(block.statements[2], "await executeRootDatabaseOperation(admin, 'integration-template-create', String(args.template));") &&
      shape(block.parent.finallyBlock, '{ await admin.end(); }') &&
      ((operation.endsWith('-drop') && block.statements[1] === statement) ||
        (operation.endsWith('-create') && block.statements[2] === statement));
  };

  return /** @param {import('typescript').CallExpression} call @param {string} entry */ (call, entry) => {
    if (call.arguments.some(ts.isSpreadElement)) return false;
    if (entry === 'executeRawScript') {
      if (call.arguments.length !== 2) return false;
      return catalogFiles.has(filename)
        ? platformScript(call) || offlineTemplateScript(call)
        : demoScript(call);
    }
    if (entry !== 'executeRootDatabaseOperation' || call.arguments.length !== 3 ||
        !call.arguments[1] || !ts.isStringLiteral(call.arguments[1])) return false;
    const operation = call.arguments[1].text;
    const family = catalogFiles.get(filename);
    if (family && [family + '-catalog-create', family + '-catalog-drop-force'].includes(operation)) {
      return catalogDatabase(call, operation);
    }
    return ['integration-template-drop', 'integration-template-create'].includes(operation) &&
      templateDatabase(call, operation);
  };
}
