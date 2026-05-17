import { Module } from '@nestjs/common';
import { FlowAdapterRegistry } from './adapters';
import { FlowAgentRulesController } from './controllers/agent-rules.controller';
import { FlowAnalyticsController } from './controllers/analytics.controller';
import { FlowAnswersController } from './controllers/answers.controller';
import { FlowEdgesController } from './controllers/edges.controller';
import { FlowEventsController } from './controllers/events.controller';
import { FlowFillsController } from './controllers/fills.controller';
import { FlowFormsController } from './controllers/forms.controller';
import { FlowGraphsController } from './controllers/graphs.controller';
import { FlowNodeFormRulesController } from './controllers/node-form-rules.controller';
import { FlowNodeRunsController } from './controllers/node-runs.controller';
import { FlowNodesController } from './controllers/nodes.controller';
import { FlowPoliciesController } from './controllers/policies.controller';
import { FlowQuestionsController } from './controllers/questions.controller';
import { FlowRunsController } from './controllers/runs.controller';
import { FlowScopesController } from './controllers/scopes.controller';
import { FlowSignalController } from './controllers/signal.controller';
import { FlowTasksController } from './controllers/tasks.controller';
import { FlowTransitionEffectsController } from './controllers/transition-effects.controller';
import { FlowAnalyticsService } from './flow-analytics.service';
import { FlowDesignService } from './flow-design.service';
import { FlowFormsService } from './flow-forms.service';
import { FlowPolicyService } from './flow-policy.service';
import { FlowRuntimeService } from './flow-runtime.service';

@Module({
  controllers: [
    FlowAgentRulesController,
    FlowAnalyticsController,
    FlowAnswersController,
    FlowEdgesController,
    FlowEventsController,
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
