import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/angular-flow',
  mutate: [
    'src/analytics.component.ts',
    'src/flow-api.service.ts',
    'src/flow-design-dialogs.component.ts',
    'src/flow-fills.component.ts',
    'src/flow-forms.component.ts',
    'src/flow-graph-canvas.component.ts',
    'src/flow-graph-designer.component.ts',
    'src/flow-run-activity.component.ts',
    'src/flow-tasks.component.ts',
    'src/flow-waivers.component.ts',
    'src/routes.ts',
    'src/tokens.ts',
  ],
  incremental: false,
});
