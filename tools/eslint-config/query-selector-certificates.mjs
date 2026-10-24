import ts from 'typescript';

// These are explicit, fail-closed composition ceilings, not changes to the
// ordinary expression proof. Their capacity must be measured against fixtures.
const limits = Object.freeze({ units: 33, edges: 32, cases: 128, leaves: 4096, steps: 65536, local: 2048, depth: 64 });
const isConst = (node) => ts.isVariableDeclarationList(node.parent) &&
  Boolean(node.parent.flags & ts.NodeFlags.Const);
const topLevel = (node) => ts.isVariableDeclaration(node) && isConst(node) &&
  ts.isVariableStatement(node.parent.parent) && ts.isSourceFile(node.parent.parent.parent);

/**
 * Prove one closed dispatcher and all its eager-leaf switch children.
 * This evaluator has no cache: every call, including repeated child targets,
 * pays its full logical cost. It never consults the ordinary expression memo.
 * A logical step inspects one expression, declaration, clause, property or
 * selector shape. Resolving the symbol of an already charged expression is an
 * atomic compiler operation; every returned declaration is charged separately.
 * Like defineQuery itself, this assumes standard JavaScript runtime semantics.
 */
export function createSelectorCertificateProof({ checker, program, pathOf }, isDataModule) {
  return (expression) => {
    const stats = { steps: 0, units: 1, edges: 0, cases: 0, graphDepth: 1, maxLocalSteps: 0, maxLocalDepth: 0 };
    const dependencies = new Set();
    const distinctLeaves = new Set();
    const root = { steps: 0, depth: 0, declaration: undefined };
    const units = [root];
    const metrics = () => Object.freeze({
      ...stats,
      distinctLeaves: distinctLeaves.size,
      unitCosts: Object.freeze(units.map((unit) => Object.freeze({
        steps: unit.steps,
        depth: unit.depth,
        file: unit.declaration?.getSourceFile().fileName,
        position: unit.declaration?.pos,
      }))),
    });
    const refusal = (reason) => { throw new Error(reason); };
    const charge = (unit, depth = 0) => {
      stats.steps += 1;
      unit.steps += 1;
      unit.depth = Math.max(unit.depth, depth);
      stats.maxLocalSteps = Math.max(stats.maxLocalSteps, unit.steps);
      stats.maxLocalDepth = Math.max(stats.maxLocalDepth, depth);
      if (stats.steps > limits.steps || unit.steps > limits.local || depth > limits.depth) {
        refusal('closed selector certificate traversal budget exceeded');
      }
    };
    const declarations = (node, unit, depth) => {
      // resolve already charged this expression before asking the checker.
      const symbol = checker.getSymbolAtLocation(node);
      const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const found = resolved?.declarations ?? [];
      // Check population before iterating compiler-provided declaration lists.
      if (found.length !== 1) refusal('selector binding is unresolved or ambiguous');
      const declaration = found[0];
      charge(unit, depth);
      const source = declaration.getSourceFile();
      if (program.getSourceFile(source.fileName) !== source) refusal('selector source belongs to another Program');
      dependencies.add(declaration);
      return declaration;
    };
    const namespace = (node, unit, depth) => {
      charge(unit, depth);
      if (!ts.isIdentifier(node)) return false;
      const found = checker.getSymbolAtLocation(node)?.declarations ?? [];
      if (found.length !== 1) return false;
      charge(unit, depth);
      return ts.isNamespaceImport(found[0]);
    };
    const resolve = (node, unit, depth = 0, seen = new Set()) => {
      charge(unit, depth);
      if (!node || seen.has(node)) refusal('cyclic selector binding');
      seen.add(node);
      if (ts.isParenthesizedExpression(node)) return resolve(node.expression, unit, depth + 1, seen);
      if (ts.isPropertyAccessExpression(node)) {
        if (!namespace(node.expression, unit, depth + 1)) refusal('selector property requires an actual module namespace');
        node = node.name;
      }
      if (!ts.isIdentifier(node)) refusal('selector origin requires an immutable source binding');
      const declaration = declarations(node, unit, depth);
      if (ts.isVariableDeclaration(declaration)) {
        if (!isConst(declaration) || !declaration.initializer) refusal('mutable or unavailable selector binding');
        if (ts.isArrowFunction(declaration.initializer) || ts.isCallExpression(declaration.initializer)) return declaration;
        return resolve(declaration.initializer, unit, depth + 1, seen);
      }
      return declaration;
    };
    const trusted = (node, name, unit) => {
      const declaration = resolve(node, unit);
      const file = declaration.getSourceFile().fileName;
      return ts.isFunctionDeclaration(declaration) && declaration.name?.text === name &&
        isDataModule({ file: pathOf(file), absoluteFile: file.replaceAll('\\', '/') }, 'typed-query');
    };
    const same = (left, right) => ts.isIdentifier(left) && ts.isIdentifier(right) &&
      checker.getSymbolAtLocation(left) === checker.getSymbolAtLocation(right);
    const arrow = (declaration, unit) => {
      charge(unit);
      unit.declaration = declaration;
      if (!topLevel(declaration) || !ts.isArrowFunction(declaration.initializer)) refusal('selector must be an eager top-level const arrow');
      const fn = declaration.initializer;
      if (!ts.isBlock(fn.body) || fn.parameters.length !== 1) refusal('unsupported selector function shape');
      for (const modifier of fn.modifiers ?? []) {
        charge(unit);
        if (modifier.kind === ts.SyntaxKind.AsyncKeyword) refusal('async selector is not supported');
      }
      const parameter = fn.parameters[0];
      if (!ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken) refusal('selector requires one ordinary parameter');
      return { fn, parameter: parameter.name };
    };
    const leaf = (node, unit) => {
      const declaration = resolve(node, unit);
      if (!topLevel(declaration) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) refusal('selector leaf is not an eager immutable query');
      distinctLeaves.add(declaration);
      const call = declaration.initializer;
      charge(unit);
      if (!pathOf(call.getSourceFile().fileName).endsWith('.repository.ts') ||
          !trusted(call.expression, 'defineQuery', unit) || call.arguments.length !== 1 ||
          !ts.isObjectLiteralExpression(call.arguments[0])) refusal('selector leaf is not a trusted repository definition');
      const properties = call.arguments[0].properties;
      if (properties.length > limits.local) refusal('oversized query options');
      const keys = new Set();
      let text;
      for (const property of properties) {
        charge(unit);
        if ((!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) ||
            (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) ||
            (ts.isShorthandPropertyAssignment(property) && property.objectAssignmentInitializer)) refusal('query options require explicit data properties');
        const key = property.name.text;
        if (key === '__proto__' || keys.has(key)) refusal('duplicate or prototype query option');
        keys.add(key);
        if (key === 'text' && ts.isPropertyAssignment(property)) text = property.initializer;
      }
      if (!text || !ts.isTaggedTemplateExpression(text) || !ts.isNoSubstitutionTemplateLiteral(text.template) ||
          !trusted(text.tag, 'sql', unit)) refusal('selector leaf text is not a trusted zero-hole SQL literal');
    };
    const child = (declaration, unit) => {
      const { fn, parameter } = arrow(declaration, unit);
      if (fn.body.statements.length !== 1 || !ts.isSwitchStatement(fn.body.statements[0])) refusal('composition child must be a single leaf switch');
      const selection = fn.body.statements[0];
      if (!same(selection.expression, parameter) || selection.caseBlock.clauses.length > limits.cases + 1) refusal('invalid or oversized leaf switch');
      let defaults = 0;
      let count = 0;
      const keys = new Set();
      for (const clause of selection.caseBlock.clauses) {
        charge(unit);
        if (clause.statements.length !== 1) refusal('selector fallthrough or effects are not proven');
        const statement = clause.statements[0];
        if (ts.isDefaultClause(clause)) {
          if (++defaults !== 1 || !ts.isThrowStatement(statement)) refusal('selector default must throw');
          continue;
        }
        count += 1;
        stats.cases += 1;
        if (count > limits.cases || stats.cases > limits.leaves) refusal('selector case occurrence budget exceeded');
        if (!ts.isNumericLiteral(clause.expression)) refusal('selector cases require literal numeric keys');
        const key = Number(clause.expression.text);
        if (!Number.isFinite(key) || keys.has(key)) refusal('duplicate or nonfinite selector key');
        keys.add(key);
        if (!ts.isReturnStatement(statement) || !statement.expression || !ts.isIdentifier(statement.expression)) refusal('selector case must return an eager leaf');
        leaf(statement.expression, unit);
      }
      if (defaults !== 1 || count === 0) refusal('selector requires cases and one throwing default');
    };
    let recognized = false;
    try {
      charge(root);
      if (!expression || !ts.isCallExpression(expression)) return undefined;
      const declaration = resolve(expression.expression, root);
      if (!ts.isVariableDeclaration(declaration) || !declaration.initializer ||
          !ts.isArrowFunction(declaration.initializer) || !ts.isBlock(declaration.initializer.body) ||
          !ts.isIfStatement(declaration.initializer.body.statements[0])) return undefined;
      recognized = true;
      if (expression.arguments.length !== 1 || ts.isSpreadElement(expression.arguments[0])) refusal('dispatcher requires one explicit argument');
      const { fn, parameter } = arrow(declaration, root);
      const statements = fn.body.statements;
      if (statements.length < 2 || statements.length > limits.edges + 1) refusal('dispatcher edge population is unsupported');
      let previous = -Infinity;
      for (let index = 0; index < statements.length; index += 1) {
        charge(root);
        const statement = statements[index];
        if (index === statements.length - 1) {
          if (!ts.isThrowStatement(statement)) refusal('dispatcher default must throw');
          continue;
        }
        stats.edges += 1;
        stats.units += 1;
        if (stats.edges > limits.edges || stats.units > limits.units) refusal('dispatcher graph population exceeded');
        if (!ts.isIfStatement(statement) || statement.elseStatement || !ts.isBinaryExpression(statement.expression)) refusal('dispatcher must contain only bounded if-return edges');
        const condition = statement.expression;
        if (condition.operatorToken.kind !== ts.SyntaxKind.LessThanToken || !same(condition.left, parameter) ||
            !ts.isNumericLiteral(condition.right)) refusal('dispatcher condition must compare its parameter to a literal bound');
        const bound = Number(condition.right.text);
        if (!Number.isFinite(bound) || bound <= previous) refusal('dispatcher bounds must be finite and increasing');
        previous = bound;
        const returned = statement.thenStatement;
        if (!ts.isReturnStatement(returned) || !returned.expression || !ts.isCallExpression(returned.expression)) refusal('dispatcher edge must immediately return its child call');
        const call = returned.expression;
        if (call.arguments.length !== 1 || !same(call.arguments[0], parameter)) refusal('dispatcher must forward its original parameter');
        stats.graphDepth = 2;
        const unit = { steps: 0, depth: 0, declaration: undefined };
        units.push(unit);
        child(resolve(call.expression, unit), unit);
      }
      return { ok: true, certificate: Object.freeze({ program, dependencies: Object.freeze([...dependencies]), ...metrics() }) };
    } catch (error) {
      // Non-composition calls still use the ordinary bounded proof. A recognized
      // composition failure never falls through to its cheap memoized path.
      if (!recognized && stats.steps <= limits.steps && root.steps <= limits.local && stats.maxLocalDepth <= limits.depth) return undefined;
      return { ok: false, reason: error instanceof Error ? error.message : 'selector certificate refused', certificate: metrics() };
    }
  };
}
