import { dirname, resolve } from 'node:path';
import * as ts from 'typescript';

const verbs = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
  ['Head', 'HEAD'],
  ['Options', 'OPTIONS'],
  ['All', 'ALL'],
  ['Search', 'SEARCH'],
  ['Sse', 'GET'],
]);
const authMarkers = new Set(['Public', 'PublicTenantRoute', 'Permission', 'ReadOnly', 'System']);
const unsupportedRouteFactories = new Set([
  'RequestMapping',
  'QueryMethod',
  'Propfind',
  'Proppatch',
  'Mkcol',
  'Copy',
  'Move',
  'Lock',
  'Unlock',
]);

/** Source declarations only. Mounting and inherited registrations are separate evidence. */
export function parseNestControllerDeclarations(text, { file = 'controller.ts' } = {}) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) {
    throw new Error(`${file}: invalid TypeScript controller source`);
  }
  const imports = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const module = statement.moduleSpecifier.text;
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if (!binding.isTypeOnly)
          imports.set(binding.name.text, {
            importSource: module,
            importedName: (binding.propertyName ?? binding.name).text,
          });
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, { importSource: module, importedName: '*' });
    }
  }
  const position = (node) => {
    const offset = node.getStart(source);
    const location = source.getLineAndCharacterOfPosition(offset);
    return { offset, line: location.line + 1, column: location.character + 1 };
  };
  const refuse = (node, reason) => {
    const at = position(node);
    throw new Error(`${file}:${at.line}:${at.column}: ${reason}`);
  };
  const symbol = (expression) => {
    if (ts.isIdentifier(expression)) {
      return {
        localName: expression.text,
        name: imports.get(expression.text)?.importedName ?? expression.text,
        importSource: imports.get(expression.text)?.importSource ?? null,
      };
    }
    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
      const binding = imports.get(expression.expression.text);
      if (binding?.importedName === '*')
        return {
          localName: expression.getText(source),
          name: expression.name.text,
          importSource: binding.importSource,
        };
    }
    return { localName: expression.getText(source), name: null, importSource: null };
  };
  const knownOrigin = (record) => {
    if (
      record.name === 'Controller' ||
      verbs.has(record.name) ||
      ['Body', 'Query'].includes(record.name)
    )
      return record.importSource === '@nestjs/common';
    if (authMarkers.has(record.name)) {
      if (record.importSource === '@stynx-nyx/auth' || record.importSource === '@stynx-nyx/backend')
        return true;
      return (
        record.importSource?.startsWith('.') &&
        resolve(dirname(file), record.importSource)
          .replaceAll('\\', '/')
          .endsWith('/packages/auth/src/decorators')
      );
    }
    return true;
  };
  const decorators = (node) =>
    (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []).map((decorator) => {
      const expression = decorator.expression;
      const call = ts.isCallExpression(expression) ? expression : null;
      const identity = symbol(call ? call.expression : expression);
      if (!identity.importSource || !knownOrigin(identity))
        refuse(decorator, `unresolved decorator identity ${identity.localName}`);
      if (
        unsupportedRouteFactories.has(identity.name) &&
        identity.importSource === '@nestjs/common'
      )
        refuse(decorator, `unsupported HTTP decorator ${identity.localName}`);
      if (
        (identity.name === 'Controller' ||
          verbs.has(identity.name) ||
          authMarkers.has(identity.name) ||
          ['Body', 'Query'].includes(identity.name)) &&
        !call
      ) {
        refuse(decorator, `decorator factory ${identity.localName} requires a call`);
      }
      let selector;
      if (['Body', 'Query'].includes(identity.name)) {
        const argument = call.arguments[0];
        if (!argument) selector = { kind: 'whole' };
        else if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
          selector = { kind: 'property', name: argument.text };
        } else refuse(argument, `unsupported computed ${identity.name} selector`);
      }
      return {
        ...identity,
        ...(selector ? { selector } : {}),
        text: decorator.getText(source),
        arguments: call ? call.arguments.map((argument) => argument.getText(source)) : [],
        position: position(decorator),
        node: decorator,
        call,
      };
    });
  const literalValue = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isArrayLiteralExpression(node)) {
      if (!node.elements.length) refuse(node, 'empty route selector array');
      return node.elements.map(literalValue);
    }
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const identity = symbol(node);
      if (identity.name === 'VERSION_NEUTRAL' && identity.importSource === '@nestjs/common') {
        return { symbol: 'VERSION_NEUTRAL', importSource: identity.importSource };
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      const identity = symbol(node.expression);
      if (
        identity.name === 'Scope' &&
        identity.importSource === '@nestjs/common' &&
        ['DEFAULT', 'REQUEST', 'TRANSIENT'].includes(node.name.text)
      ) {
        return { symbol: `Scope.${node.name.text}`, importSource: identity.importSource };
      }
    }
    return refuse(node, `unsupported computed route selector ${node.getText(source)}`);
  };
  const optionValue = (key, node) => {
    const value = literalValue(node);
    const flat = Array.isArray(value) ? value : [value];
    const neutral = (item) => item?.symbol === 'VERSION_NEUTRAL';
    const valid =
      key === 'version'
        ? flat.every((item) => typeof item === 'string' || neutral(item))
        : key === 'host'
          ? flat.every((item) => typeof item === 'string')
          : key === 'scope'
            ? !Array.isArray(value) &&
              ['Scope.DEFAULT', 'Scope.REQUEST', 'Scope.TRANSIENT'].includes(value?.symbol)
            : key === 'durable' && typeof value === 'boolean';
    if (!valid) refuse(node, `invalid Controller ${key} option`);
    return value;
  };
  const paths = (node) => {
    if (!node) return [''];
    const value = literalValue(node);
    const values = Array.isArray(value) ? value : [value];
    if (!values.every((item) => typeof item === 'string'))
      refuse(node, 'route paths must be literal strings');
    return values;
  };
  const publicRecord = ({ node: _node, call: _call, ...record }) => record;
  const controllers = [];
  for (const node of source.statements) {
    if (!ts.isClassDeclaration(node)) continue;
    const classDecorators = decorators(node);
    const controller = classDecorators.find((item) => item.name === 'Controller');
    if (!controller) continue;
    if (!node.name) refuse(node, 'anonymous controller');
    const argument = controller.call?.arguments[0];
    if (controller.call?.arguments.length > 1)
      refuse(controller.node, 'multiple Controller arguments');
    let controllerPaths = [''];
    const options = {};
    if (argument && ts.isObjectLiteralExpression(argument)) {
      const seen = new Set();
      for (const property of argument.properties) {
        if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
          refuse(property, 'unsupported Controller option');
        }
        const key =
          ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
            ? property.name.text
            : null;
        if (!['path', 'version', 'host', 'scope', 'durable'].includes(key) || seen.has(key)) {
          refuse(property, `unknown or duplicate Controller option ${key}`);
        }
        seen.add(key);
        if (key === 'path') controllerPaths = paths(property.initializer);
        else options[key] = optionValue(key, property.initializer);
      }
    } else if (argument) controllerPaths = paths(argument);
    const methods = [];
    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const methodDecorators = decorators(member);
      const routeDecorators = methodDecorators.filter((item) => verbs.has(item.name));
      if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name))
        refuse(member, 'computed route handler name');
      if (routeDecorators.length > 1)
        refuse(member, 'multiple HTTP decorators overwrite handler registration');
      const registrations = [];
      for (const decorator of routeDecorators) {
        if (!decorator.call || decorator.call.arguments.length > 1)
          refuse(decorator.node, 'unsupported HTTP decorator arguments');
        for (const path of paths(decorator.call.arguments[0]))
          registrations.push({ method: verbs.get(decorator.name), path });
      }
      methods.push({
        name: member.name.text,
        position: position(member),
        decorators: methodDecorators.map(publicRecord),
        registrations,
        signature: text.slice(member.getStart(source), member.body?.getStart(source) ?? member.end),
        source: member.getText(source),
        returnType: member.type?.getText(source) ?? null,
        parameters: member.parameters.map((parameter) => ({
          name: parameter.name.getText(source),
          type: parameter.type?.getText(source) ?? null,
          decorators: decorators(parameter).map(publicRecord),
        })),
      });
    }
    controllers.push({
      name: node.name.text,
      paths: controllerPaths,
      options,
      position: position(node),
      source: node.getText(source),
      decorators: classDecorators.map(publicRecord),
      extends: (node.heritageClauses ?? [])
        .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
        .flatMap((clause) =>
          clause.types.map((type) => ({
            expression: type.expression.getText(source),
            ...symbol(type.expression),
          })),
        ),
      methods,
    });
  }
  return controllers;
}
