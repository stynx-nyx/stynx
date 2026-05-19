import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-storage',
  mutate: [
    'src/document-download.component.ts',
    'src/document-upload.component.ts',
    'src/document.service.ts',
    'src/multipart-upload.executor.ts',
    'src/xhr-upload.executor.ts',
  ],
});
