// STYNX workspace entry point (`--config ../../tools/eslint-config/lib.mjs`).
// Adopters build their config from the named `createLibConfig` factory.
import { createLibConfig } from './index.mjs';
import { stynxWorkspaceOptions } from './workspace.mjs';

export default createLibConfig(stynxWorkspaceOptions);
