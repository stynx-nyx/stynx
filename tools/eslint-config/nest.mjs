// STYNX workspace entry point (`--config ../../tools/eslint-config/nest.mjs`).
// Adopters build their config from the named `createNestConfig` factory.
import { createNestConfig } from './index.mjs';
import { stynxWorkspaceOptions } from './workspace.mjs';

export default createNestConfig(stynxWorkspaceOptions);
