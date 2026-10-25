import { workspaceRuntimeRemaindersConfig } from './workspace-runtime-remainders.mjs';
import { workspaceImageSizeConfig } from './workspace-image-size.mjs';
import { workspaceToolingConfig } from './workspace-tooling.mjs';
import { workspaceImplementationConfig } from './workspace-implementation.mjs';

export default [
  ...workspaceToolingConfig,
  ...workspaceImplementationConfig,
  ...workspaceImageSizeConfig,
  ...workspaceRuntimeRemaindersConfig,
];
