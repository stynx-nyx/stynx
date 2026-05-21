import 'reflect-metadata';
import {
  STYNX_PERMISSION_ROUTE,
  STYNX_PUBLIC_ROUTE,
  STYNX_READONLY_ROUTE,
} from '@stynx/auth';
import {
  STYNX_AUDIT_METADATA,
  STYNX_IDEMPOTENT_ROUTE,
  STYNX_NO_IDEMPOTENT_ROUTE,
  STYNX_RATE_LIMIT_ROUTE,
} from '@stynx/backend';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PermissionGuard, StynxAuthGuard } from '@stynx/auth';
import { FlowAgentRulesController } from '../../src/controllers/agent-rules.controller';
import { FlowAnalyticsController } from '../../src/controllers/analytics.controller';
import { FlowAnswersController } from '../../src/controllers/answers.controller';
import { FlowEdgesController } from '../../src/controllers/edges.controller';
import { FlowEventsController } from '../../src/controllers/events.controller';
import { FlowEffectsController } from '../../src/controllers/effects.controller';
import { FlowFillsController } from '../../src/controllers/fills.controller';
import { FlowFormsController } from '../../src/controllers/forms.controller';
import { FlowGraphsController } from '../../src/controllers/graphs.controller';
import { FlowNodeFormRulesController } from '../../src/controllers/node-form-rules.controller';
import { FlowNodeRunsController } from '../../src/controllers/node-runs.controller';
import { FlowNodesController } from '../../src/controllers/nodes.controller';
import { FlowPoliciesController } from '../../src/controllers/policies.controller';
import { FlowQuestionsController } from '../../src/controllers/questions.controller';
import { FlowRunsController } from '../../src/controllers/runs.controller';
import { FlowScopesController } from '../../src/controllers/scopes.controller';
import { FlowSignalController } from '../../src/controllers/signal.controller';
import { FlowTasksController } from '../../src/controllers/tasks.controller';
import { FlowTransitionEffectsController } from '../../src/controllers/transition-effects.controller';
import { FlowWaiversController } from '../../src/controllers/waivers.controller';

type ControllerClass = abstract new (...args: never[]) => object;

const controllers: ControllerClass[] = [
  FlowAgentRulesController,
  FlowAnalyticsController,
  FlowAnswersController,
  FlowEdgesController,
  FlowEventsController,
  FlowEffectsController,
  FlowFillsController,
  FlowFormsController,
  FlowGraphsController,
  FlowNodeFormRulesController,
  FlowNodeRunsController,
  FlowNodesController,
  FlowPoliciesController,
  FlowQuestionsController,
  FlowRunsController,
  FlowScopesController,
  FlowSignalController,
  FlowTasksController,
  FlowTransitionEffectsController,
  FlowWaiversController,
];

function handler(controller: ControllerClass, methodName: string): Function {
  const value = controller.prototype[methodName as keyof object];
  if (typeof value !== 'function') {
    throw new Error(`${controller.name}.${methodName} is not a handler`);
  }
  return value;
}

function metadata<T>(key: unknown, controller: ControllerClass, methodName: string): T | undefined {
  return Reflect.getMetadata(key, handler(controller, methodName)) as T | undefined;
}

describe('Flow route contracts', () => {
  it('keeps every Flow route private and permissioned', () => {
    for (const controller of controllers) {
      expect(Reflect.getMetadata(STYNX_PUBLIC_ROUTE, controller)).toBe(undefined);
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual(
        expect.arrayContaining([StynxAuthGuard, PermissionGuard]),
      );
      const methodNames = Object.getOwnPropertyNames(controller.prototype)
        .filter((name) => name !== 'constructor')
        .filter((name) => typeof controller.prototype[name as keyof object] === 'function');

      for (const methodName of methodNames) {
        expect(Reflect.getMetadata(STYNX_PUBLIC_ROUTE, handler(controller, methodName))).toBe(undefined);
        expect(metadata<string>(STYNX_PERMISSION_ROUTE, controller, methodName)).toMatch(/^flow:/);
      }
    }
  });

  it('marks read routes as read-only', () => {
    const readRoutes: Array<[ControllerClass, string, string]> = [
      [FlowScopesController, 'list', 'flow:read:design'],
      [FlowGraphsController, 'export', 'flow:read:design'],
      [FlowFormsController, 'questions', 'flow:read:design'],
      [FlowFillsController, 'answers', 'flow:read:runtime'],
      [FlowFillsController, 'waivers', 'flow:read:runtime'],
      [FlowFormsController, 'fillDetail', 'flow:read:runtime'],
      [FlowFormsController, 'fillAnswers', 'flow:read:runtime'],
      [FlowFormsController, 'fillWaivers', 'flow:read:runtime'],
      [FlowRunsController, 'facts', 'flow:read:runtime'],
      [FlowRunsController, 'summary', 'flow:read:analytics'],
      [FlowAnalyticsController, 'openTasks', 'flow:read:analytics'],
      [FlowTasksController, 'candidates', 'flow:assign:task'],
      [FlowPoliciesController, 'evaluate', 'flow:read:runtime'],
    ];

    for (const [controller, methodName, permission] of readRoutes) {
      expect(metadata<string>(STYNX_PERMISSION_ROUTE, controller, methodName)).toBe(permission);
      expect(metadata<boolean>(STYNX_READONLY_ROUTE, controller, methodName)).toBe(true);
      expect(metadata(STYNX_AUDIT_METADATA, controller, methodName)).toBe(undefined);
    }
  });

  it('audits mutations and idempotently protects retryable task/form writes', () => {
    const auditedRoutes: Array<[ControllerClass, string, string]> = [
      [FlowScopesController, 'create', 'flow.scope.create'],
      [FlowGraphsController, 'import', 'flow.graph.import'],
      [FlowGraphsController, 'publish', 'flow.graph.publish'],
      [FlowFormsController, 'createFill', 'flow.fill.create'],
      [FlowFormsController, 'createFillWaiver', 'flow.waiver.create'],
      [FlowFillsController, 'create', 'flow.fill.create'],
      [FlowFillsController, 'upsertAnswer', 'flow.answer.upsert'],
      [FlowFillsController, 'bulkUpsertAnswers', 'flow.answer.bulk_upsert'],
      [FlowFillsController, 'createWaiver', 'flow.waiver.create'],
      [FlowWaiversController, 'create', 'flow.waiver.create'],
      [FlowTasksController, 'act', 'flow.task.act'],
      [FlowTasksController, 'assign', 'flow.task.assign'],
      [FlowEffectsController, 'dispatch', 'flow.effect.dispatch'],
      [FlowSignalController, 'signal', 'flow.signal'],
    ];

    for (const [controller, methodName, action] of auditedRoutes) {
      expect(metadata<{ action: string }>(STYNX_AUDIT_METADATA, controller, methodName)?.action).toBe(action);
    }

    for (const [controller, methodName] of [
      [FlowFormsController, 'createFill'],
      [FlowFormsController, 'createFillWaiver'],
      [FlowFillsController, 'create'],
      [FlowFillsController, 'upsertAnswer'],
      [FlowFillsController, 'bulkUpsertAnswers'],
      [FlowFillsController, 'createWaiver'],
      [FlowWaiversController, 'create'],
      [FlowGraphsController, 'publish'],
      [FlowTasksController, 'act'],
      [FlowTasksController, 'assign'],
      [FlowEffectsController, 'dispatch'],
      [FlowSignalController, 'signal'],
    ] satisfies Array<[ControllerClass, string]>) {
      expect(metadata<{ headerName: string }>(STYNX_IDEMPOTENT_ROUTE, controller, methodName)).toEqual({
        headerName: 'Idempotency-Key',
      });
    }

    expect(metadata<boolean>(STYNX_NO_IDEMPOTENT_ROUTE, FlowScopesController, 'create')).toBe(true);
  });

  it('rate-limits user-triggered runtime mutations', () => {
    const rateLimitedRoutes: Array<[ControllerClass, string, string]> = [
      [FlowEffectsController, 'dispatch', 'flow.effect.dispatch'],
      [FlowSignalController, 'signal', 'flow.signal'],
      [FlowTasksController, 'act', 'flow.task.act'],
      [FlowFillsController, 'bulkUpsertAnswers', 'flow.answer.bulk_upsert'],
    ];

    for (const [controller, methodName, scope] of rateLimitedRoutes) {
      expect(metadata<{ scope: string }>(STYNX_RATE_LIMIT_ROUTE, controller, methodName)?.scope).toBe(scope);
    }
  });
});
