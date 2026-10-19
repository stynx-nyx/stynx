// STYNX workspace entry point (`--config ../../tools/eslint-config/angular.mjs`).
// Adopters build their config from the named `createAngularConfig` factory.
import { createAngularConfig } from './index.mjs';
import { stynxWorkspaceOptions } from './workspace.mjs';

export default createAngularConfig(stynxWorkspaceOptions);
