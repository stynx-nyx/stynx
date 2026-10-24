import { relative, resolve } from 'node:path';

const file = 'packages/testing/src/fake-transaction.ts';

// ADR0033 F2 authorizes these existing expressions only. Whitespace outside
// quoted literals is immaterial; comments, tokens and literal contents are not.
function projection(source) {
  let result = '';
  let quote = null;
  let escaped = false;
  for (const character of source) {
    if (quote !== null) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"' || character === '`') {
      quote = character;
      result += character;
    } else if (!/\s/.test(character)) {
      result += character;
    }
  }
  return result;
}

export const legacyTestingAssertionCensus = Object.freeze({
  file,
  rule: '@typescript-eslint/no-unsafe-type-assertion',
  messageId: 'unsafeTypeAssertion',
  sites: Object.freeze([
    Object.freeze({
      name: 'scripted-query-result',
      expression: projection(`{
        command: 'SELECT', rowCount: next.rowCount, oid: 0, fields: [], rows,
      } as Awaited<ReturnType<Transaction['query']>>`),
    }),
    Object.freeze({
      name: 'promise-client-adapter',
      expression: projection('{ query } as unknown as Parameters<typeof createDrizzle>[0]'),
    }),
  ]),
});

function originalFactory(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== 'FunctionDeclaration') continue;
    if (parent.id?.name !== 'createFakeTransaction') return null;
    if (parent.parent?.type !== 'ExportNamedDeclaration' || parent.parent.parent?.type !== 'Program') return null;
    return parent;
  }
  return null;
}

function originalVariable(node, name, factory) {
  return node?.type === 'VariableDeclarator'
    && node.id.type === 'Identifier'
    && node.id.name === name
    && node.parent?.type === 'VariableDeclaration'
    && node.parent.kind === 'const'
    && node.parent.parent === factory.body;
}

function siteOf(sourceCode, node) {
  if (node?.type !== 'TSAsExpression') return -1;
  const factory = originalFactory(node);
  if (factory === null) return -1;
  const text = projection(sourceCode.getText(node));
  const index = legacyTestingAssertionCensus.sites.findIndex((site) => site.expression === text);
  if (index === 0) {
    if (node.parent?.type !== 'ReturnStatement') return -1;
    const body = node.parent.parent;
    const scope = body?.parent;
    if (body?.type !== 'BlockStatement' || scope?.type !== 'ArrowFunctionExpression'
      || scope.body !== body || !scope.async
      || !originalVariable(scope.parent, 'query', factory)) return -1;
  } else if (index === 1) {
    if (!originalVariable(node.parent, 'client', factory)) return -1;
  }
  return index;
}

/** Preserve the installed rule, with only the accepted exact diagnostic projection removed. */
export function withLegacyTestingAssertions(rule, rootDir) {
  return {
    ...rule,
    meta: {
      ...rule.meta,
      messages: {
        ...rule.meta.messages,
        legacyTestingAssertionCensus: 'ADR0033 requires exactly the two approved legacy testing assertion projections in their original scopes.',
      },
    },
    create(context) {
      const path = relative(resolve(rootDir), resolve(context.filename)).replaceAll('\\', '/');
      if (path !== file) return rule.create(context);
      const sourceCode = context.sourceCode;
      const counts = [0, 0];
      const proxy = Object.create(context);
      Object.defineProperty(proxy, 'report', {
        value(descriptor) {
          if (descriptor.messageId === legacyTestingAssertionCensus.messageId && siteOf(sourceCode, descriptor.node) >= 0) return;
          context.report(descriptor);
        },
      });
      const listeners = rule.create(proxy);
      const observe = listeners.TSAsExpression;
      const exit = listeners['Program:exit'];
      return {
        ...listeners,
        TSAsExpression(node) {
          observe?.(node);
          const index = siteOf(sourceCode, node);
          if (index >= 0) counts[index] += 1;
        },
        'Program:exit'(node) {
          exit?.(node);
          if (counts.some((count) => count !== 1)) {
            context.report({ node, messageId: 'legacyTestingAssertionCensus' });
          }
        },
      };
    },
  };
}
