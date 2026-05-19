import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

function getPropertyName(property) {
  if (property.type !== 'Property' || property.computed) {
    return null;
  }

  if (property.key.type === 'Identifier') {
    return property.key.name;
  }

  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }

  return null;
}

function isOnPushExpression(node) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === 'ChangeDetectionStrategy' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'OnPush'
  );
}

function getComponentMetadata(decorator) {
  if (decorator.expression?.type !== 'CallExpression') {
    return null;
  }

  const call = decorator.expression;
  if (call.callee.type !== 'Identifier' || call.callee.name !== 'Component') {
    return null;
  }

  const [metadata] = call.arguments;
  return metadata?.type === 'ObjectExpression' ? metadata : null;
}

const angularEslintPlugin = {
  rules: {
    'prefer-on-push-component-change-detection': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Require Angular components to use ChangeDetectionStrategy.OnPush.',
        },
        schema: [],
        messages: {
          preferOnPush:
            'Components must declare changeDetection: ChangeDetectionStrategy.OnPush.',
        },
      },
      create(context) {
        return {
          ClassDeclaration(node) {
            for (const decorator of node.decorators ?? []) {
              const metadata = getComponentMetadata(decorator);
              if (!metadata) {
                continue;
              }

              const changeDetection = metadata.properties.find(
                (property) => getPropertyName(property) === 'changeDetection',
              );

              if (changeDetection?.type === 'Property' && isOnPushExpression(changeDetection.value)) {
                continue;
              }

              context.report({
                node: changeDetection ?? decorator,
                messageId: 'preferOnPush',
              });
            }
          },
        };
      },
    },
  },
};

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.angular/**',
      'docs/.docusaurus/**',
      'docs/build/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      '@angular-eslint': angularEslintPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
    },
  },
];
