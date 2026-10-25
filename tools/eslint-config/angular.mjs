// STYNX workspace entry point (`--config ../../tools/eslint-config/angular.mjs`).
// Adopters build their config from the named `createAngularConfig` factory.
import { createAngularConfig } from './index.mjs';
import { stynxWorkspaceOptions } from './workspace.mjs';
import { angularTestingConfigForRoot } from './workspace-angular-testing.mjs';

export default [
  ...createAngularConfig(stynxWorkspaceOptions),
  ...angularTestingConfigForRoot(process.cwd()),
];
