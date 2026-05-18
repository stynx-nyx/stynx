import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-ui',
  threshold: 60,
  mutate: [
    'src/banner.component.ts',
    'src/confirm-dialog.component.ts',
    'src/loading-spinner.component.ts',
    'src/pagination.component.ts',
    'src/table.component.ts',
    'src/toast-container.component.ts',
    'src/toast.service.ts',
  ],
});
