import { fileURLToPath } from 'node:url';
import { createAngularConfig } from '../../../tools/eslint-config/index.mjs';
import { stynxWorkspaceOptions } from '../../../tools/eslint-config/workspace.mjs';

export default createAngularConfig({
  ...stynxWorkspaceOptions,
  rootDir: fileURLToPath(new URL('.', import.meta.url)),
  tsconfig: './tsconfig.json',
});
