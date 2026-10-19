// STYNX workspace entry point for repository scripts (`--config
// ../../tools/eslint-config/scripts.mjs`). Adopters use the named
// `createScriptsConfig` factory from the package root instead.
import { createScriptsConfig } from './index.mjs';
import { stynxWorkspaceOptions } from './workspace.mjs';

export default createScriptsConfig({ strict: stynxWorkspaceOptions.strict });
