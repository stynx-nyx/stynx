import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibConfig } from './index.mjs';
import { stynxWorkspaceOptions } from './workspace.mjs';
import imageSizeProject from './tsconfig.workspace-image-size.json' with { type: 'json' };

const directory = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = stynxWorkspaceOptions.workspaceQuery.rootDir;
const packageRoot = resolve(workspaceRoot, 'tools/image-size-safe');
export const workspaceImageSizeFiles = imageSizeProject.files.map((file) =>
  relative(workspaceRoot, resolve(directory, file)).replaceAll('\\', '/'),
);
const files = imageSizeProject.files.map((file) =>
  relative(packageRoot, resolve(directory, file)).replaceAll('\\', '/'),
);

// This maintained library keeps its own Node16/DOM compiler context and both
// build formats. Only lint routing is added; no runtime files or exports change.
const configs = createLibConfig({
  ...stynxWorkspaceOptions,
  rootDir: packageRoot,
  files,
  tsconfig: resolve(directory, 'tsconfig.workspace-image-size.json'),
  boundaries: {
    ...stynxWorkspaceOptions.boundaries,
    elements: [
      ...stynxWorkspaceOptions.boundaries.elements,
      { type: 'image-size-safe', pattern: 'tools/image-size-safe/lib' },
    ],
  },
}).filter((config) => config.files?.some((file) => files.includes(file)));
if (configs.length !== 1) throw new Error('Image-size has no unique library source profile.');
export const workspaceImageSizeConfig = configs.map((config) => ({
  ...config,
  basePath: packageRoot,
}));
