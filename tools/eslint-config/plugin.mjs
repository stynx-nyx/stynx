// The `stynx/*` ESLint rules shared by every profile in this package.

const writeRouteDecoratorNames = new Set(['Post', 'Put', 'Patch']);
const idempotencyDecoratorNames = new Set(['Idempotent', 'NoIdempotent']);

// D-057: authored code is ESM. These are the CommonJS module-scope bindings
// that only exist when a file is evaluated as CommonJS.
const commonJsBindings = new Set(['require', 'module', 'exports', '__dirname', '__filename']);
const nodeModuleSpecifiers = new Set(['module', 'node:module']);

function isImplicitGlobal(variable) {
  return variable !== null && variable !== undefined && variable.defs.length === 0;
}

function getDecoratorName(decorator) {
  const expression = decorator.expression;
  if (!expression) return null;
  if (expression.type === 'Identifier') {
    return expression.name;
  }
  if (expression.type === 'CallExpression') {
    if (expression.callee.type === 'Identifier') {
      return expression.callee.name;
    }
    if (
      expression.callee.type === 'MemberExpression' &&
      expression.callee.property.type === 'Identifier'
    ) {
      return expression.callee.property.name;
    }
  }
  return null;
}

function collectDecoratorNames(node) {
  if (!Array.isArray(node.decorators)) return [];
  return node.decorators
    .map((decorator) => getDecoratorName(decorator))
    .filter((name) => typeof name === 'string');
}

export const stynxPlugin = {
  rules: {
    'no-authored-cjs': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbid CommonJS in authored code: require, createRequire, module.exports, exports, __dirname and __filename.',
        },
        schema: [],
        messages: {
          commonJsBinding:
            '`{{name}}` is a CommonJS binding; authored code is ESM (use import, export and import.meta.dirname/filename).',
          createRequire:
            'createRequire re-enters CommonJS; authored code is ESM (use import or a JSON import attribute).',
          importEqualsRequire: '`import x = require()` is CommonJS; use an ES import.',
          exportAssignment: '`export =` is CommonJS; use an ES export.',
        },
      },
      create(context) {
        const sourceCode = context.sourceCode;
        const reportReference = (reference) => {
          context.report({
            node: reference.identifier,
            messageId: 'commonJsBinding',
            data: { name: reference.identifier.name },
          });
        };

        return {
          ImportDeclaration(node) {
            if (!nodeModuleSpecifiers.has(node.source.value)) return;
            for (const specifier of node.specifiers) {
              if (
                specifier.type === 'ImportSpecifier' &&
                (specifier.imported.name ?? specifier.imported.value) === 'createRequire'
              ) {
                context.report({ node: specifier, messageId: 'createRequire' });
              }
            }
          },
          MemberExpression(node) {
            const property = node.property;
            const name = node.computed
              ? property.type === 'Literal'
                ? property.value
                : null
              : property.name;
            if (name === 'createRequire') {
              context.report({ node, messageId: 'createRequire' });
            }
          },
          TSImportEqualsDeclaration(node) {
            if (node.moduleReference.type === 'TSExternalModuleReference') {
              context.report({ node, messageId: 'importEqualsRequire' });
            }
          },
          TSExportAssignment(node) {
            context.report({ node, messageId: 'exportAssignment' });
          },
          'Program:exit'(node) {
            const globalScope = sourceCode.getScope(node);
            for (const name of commonJsBindings) {
              const variable = globalScope.set.get(name);
              if (isImplicitGlobal(variable)) {
                variable.references.forEach(reportReference);
              }
            }
            for (const reference of globalScope.through) {
              if (commonJsBindings.has(reference.identifier.name)) {
                reportReference(reference);
              }
            }
          },
        };
      },
    },
    'require-package-index-tsdoc': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Require package barrel files to carry package-level TSDoc.',
        },
        schema: [],
        messages: {
          missingPackageDocs:
            'Package public barrel must start with a TSDoc @packageDocumentation block.',
        },
      },
      create(context) {
        return {
          Program(node) {
            const sourceCode = context.sourceCode;
            const firstComment = sourceCode.getAllComments()[0];
            if (
              firstComment?.type === 'Block' &&
              firstComment.value.includes('*') &&
              firstComment.value.includes('@packageDocumentation')
            ) {
              return;
            }

            context.report({
              node,
              messageId: 'missingPackageDocs',
            });
          },
        };
      },
    },
    'require-idempotent-route-decorator': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Report POST/PUT/PATCH routes without @Idempotent() or @NoIdempotent().',
        },
        schema: [],
        messages: {
          missingDecorator:
            'POST/PUT/PATCH routes should declare @Idempotent() or @NoIdempotent().',
        },
      },
      create(context) {
        return {
          MethodDefinition(node) {
            const routeDecorators = collectDecoratorNames(node).filter((name) =>
              writeRouteDecoratorNames.has(name),
            );
            if (routeDecorators.length === 0) {
              return;
            }

            const methodDecorators = collectDecoratorNames(node);
            if (methodDecorators.some((name) => idempotencyDecoratorNames.has(name))) {
              return;
            }

            const classDecorators = collectDecoratorNames(node.parent?.parent);
            if (classDecorators.some((name) => idempotencyDecoratorNames.has(name))) {
              return;
            }

            context.report({
              node,
              messageId: 'missingDecorator',
            });
          },
        };
      },
    },
  },
};
