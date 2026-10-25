import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { relative, resolve } from 'node:path';

/** @typedef {import('./plugin.mjs').NativeRule} NativeRule */
/** @typedef {import('./plugin.mjs').NativeContext} NativeContext */
/** @typedef {import('./plugin.mjs').ESTreeNode} ESTreeNode */
/** @typedef {Extract<Parameters<NativeContext['report']>[0], {node: unknown}>['node']} ReportNode */


const file = 'packages/testing/src/fake-transaction.ts';

// ADR0033 F2 authorizes these existing expressions only. Whitespace outside
// quoted literals is immaterial; comments, tokens and literal contents are not.
/** @param {string} source */
function projection(source) {
  let result = '';
  /** @type {string | null} */
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

/** @param {ESTreeNode} node */
function originalFactory(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== AST_NODE_TYPES.FunctionDeclaration) continue;
    if (parent.id?.name !== 'createFakeTransaction') return null;
    if (parent.parent?.type !== AST_NODE_TYPES.ExportNamedDeclaration || parent.parent.parent?.type !== AST_NODE_TYPES.Program) return null;
    return parent;
  }
  return null;
}

/** @param {ESTreeNode | undefined} node @param {string} name @param {Extract<ESTreeNode, {type: 'FunctionDeclaration'}>} factory */
function originalVariable(node, name, factory) {
  return node?.type === AST_NODE_TYPES.VariableDeclarator
    && node.id.type === AST_NODE_TYPES.Identifier
    && node.id.name === name
    && node.parent?.type === AST_NODE_TYPES.VariableDeclaration
    && node.parent.kind === 'const'
    && node.parent.parent === factory.body;
}

/** @param {NativeContext['sourceCode']} sourceCode @param {ReportNode | undefined} node */
function siteOf(sourceCode, node) {
  if (node?.type !== AST_NODE_TYPES.TSAsExpression) return -1;
  const factory = originalFactory(node);
  if (factory === null) return -1;
  const text = projection(sourceCode.getText(node));
  const index = legacyTestingAssertionCensus.sites.findIndex((site) => site.expression === text);
  if (index === 0) {
    if (node.parent?.type !== AST_NODE_TYPES.ReturnStatement) return -1;
    const body = node.parent.parent;
    const scope = body?.parent;
    if (body?.type !== AST_NODE_TYPES.BlockStatement || scope?.type !== AST_NODE_TYPES.ArrowFunctionExpression
      || scope.body !== body || !scope.async
      || !originalVariable(scope.parent, 'query', factory)) return -1;
  } else if (index === 1) {
    if (!originalVariable(node.parent, 'client', factory)) return -1;
  }
  return index;
}

/** Preserve the installed rule, with only the accepted exact diagnostic projection removed. */
/** @param {NativeRule | undefined} rule @param {string} rootDir @returns {NativeRule} */
export function withLegacyTestingAssertions(rule, rootDir) {
  if (!rule) throw new Error('Installed TypeScript ESLint plugin has no unsafe assertion rule.');
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
      /** @type {[number, number]} */
      const counts = [0, 0];
      /** @type {NativeContext['report']} */
      const report = (descriptor) => {
        if (descriptor.messageId === legacyTestingAssertionCensus.messageId && siteOf(sourceCode, 'node' in descriptor ? descriptor.node : undefined) >= 0) return;
        context.report(descriptor);
      };
      /** @type {unknown} */
      const proxy = Object.create(context);
      if (typeof proxy !== 'object' || proxy === null) throw new TypeError('Context view construction failed.');
      Object.defineProperty(proxy, 'report', { value: report });
      // The native context supplies every inherited field. The only own field
      // is the same typed report override installed immediately above.
      /** @param {object} view @returns {view is NativeContext} */
      const constructedContext = (view) => {
        const keys = Reflect.ownKeys(view);
        const descriptor = Object.getOwnPropertyDescriptor(view, 'report');
        return Object.getPrototypeOf(view) === context && keys.length === 1 && keys[0] === 'report' &&
          descriptor !== undefined && descriptor.value === report &&
          descriptor.get === undefined && descriptor.set === undefined &&
          descriptor.writable === false && descriptor.enumerable === false && descriptor.configurable === false;
      };
      if (!constructedContext(proxy)) throw new TypeError('Context view construction differs from its native prototype and report override.');
      const listeners = rule.create(proxy);
      const observe = listeners.TSAsExpression;
      const exit = listeners['Program:exit'];
      return {
        ...listeners,
        TSAsExpression(node) {
          observe?.(node);
          const index = siteOf(sourceCode, node);
          if (index === 0 || index === 1) counts[index] += 1;
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
