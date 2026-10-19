import { Module } from '@nestjs/common';
import { FlowAdapterRegistry } from './adapters.js';
import { FlowAgentRulesController } from './controllers/agent-rules.controller.js';
import { FlowAnalyticsController } from './controllers/analytics.controller.js';
import { FlowAnswersController } from './controllers/answers.controller.js';
import { FlowEdgesController } from './controllers/edges.controller.js';
import { FlowEventsController } from './controllers/events.controller.js';
import { FlowEffectsController } from './controllers/effects.controller.js';
import { FlowFillsController } from './controllers/fills.controller.js';
import { FlowFormsController } from './controllers/forms.controller.js';
import { FlowGraphsController } from './controllers/graphs.controller.js';
import { FlowNodeFormRulesController } from './controllers/node-form-rules.controller.js';
import { FlowNodeRunsController } from './controllers/node-runs.controller.js';
import { FlowNodesController } from './controllers/nodes.controller.js';
import { FlowPoliciesController } from './controllers/policies.controller.js';
import { FlowQuestionsController } from './controllers/questions.controller.js';
import { FlowRunsController } from './controllers/runs.controller.js';
import { FlowScopesController } from './controllers/scopes.controller.js';
import { FlowSignalController } from './controllers/signal.controller.js';
import { FlowTasksController } from './controllers/tasks.controller.js';
import { FlowTransitionEffectsController } from './controllers/transition-effects.controller.js';
import { FlowAnalyticsService } from './flow-analytics.service.js';
import { FlowDesignService } from './flow-design.service.js';
import { FlowFormsService } from './flow-forms.service.js';
import { FlowPolicyService } from './flow-policy.service.js';
import { FlowRuntimeService } from './flow-runtime.service.js';

@Module({
  controllers: [
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
  ],
  providers: [
    FlowAdapterRegistry,
    FlowAnalyticsService,
    FlowDesignService,
    FlowFormsService,
    FlowPolicyService,
    FlowRuntimeService,
  ],
  exports: [
    FlowAdapterRegistry,
    FlowAnalyticsService,
    FlowDesignService,
    FlowFormsService,
    FlowPolicyService,
    FlowRuntimeService,
  ],
})
export class StynxFlowModule {}
