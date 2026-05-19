import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-storage',
  mutate: [
    'src/document-upload.component.ts',
    'src/document.service.ts',
    'src/xhr-upload.executor.ts',
  ],
});
