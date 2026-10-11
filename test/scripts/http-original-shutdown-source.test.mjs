import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// INV-PERF-001: source-contract guard only. Actual shared-deadline expiry still
// needs the genuine admitted parent; this guard confers no executed cleanup.
const source = readFileSync(
  new URL('../../scripts/lib/http-fresh-build.mjs', import.meta.url),
  'utf8',
);
const file = ts.createSourceFile(
  'http-fresh-build.mjs',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
const parent = file.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'runActualOriginalScenario',
);
assert.ok(parent);
const nodes = [];
function visit(node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(parent);
const assignments = nodes.filter(
  (node) => ts.isBinaryExpression(node) && node.left.getText(file) === 'cleanupDeadline',
);

test('original shutdown source initializes one 30-second deadline and fallback paths never renew it', () => {
  assert.equal(assignments.length, 3);
  assert.deepEqual(
    assignments.map((node) => node.operatorToken.kind),
    [
      ts.SyntaxKind.EqualsToken,
      ts.SyntaxKind.QuestionQuestionEqualsToken,
      ts.SyntaxKind.QuestionQuestionEqualsToken,
    ],
  );
  for (const node of assignments)
    assert.equal(node.right.getText(file), 'originalClock() + 30_000_000_000n');
});

test('all source shutdown waits and final fixture observations share that exact deadline identifier', () => {
  const shutdownStart = assignments[0].pos;
  const waits = nodes.filter(
    (node) =>
      ts.isCallExpression(node) &&
      node.pos > shutdownStart &&
      ['until', 'phase'].includes(node.expression.getText(file)),
  );
  assert.equal(waits.length, 9);
  for (const call of waits) {
    assert.equal(call.arguments.length, 2);
    assert.equal(call.arguments[1].getText(file), 'cleanupDeadline', call.getText(file));
  }
  for (const action of [
    'reapReferenceWorker(state)',
    'reapQualificationGenerator(state)',
    'closeOwnedReferenceFixture(fixtureHandle)',
  ])
    assert.ok(
      waits.some((call) => call.arguments[0].getText(file) === action),
      action,
    );
  assert.ok(
    waits.some(
      (call) => call.arguments[0].getText(file) === 'observeOwnedReferenceFixture(fixtureHandle)',
    ),
  );
  assert.ok(waits.some((call) => call.arguments[0].getText(file) === 'pending'));
});
