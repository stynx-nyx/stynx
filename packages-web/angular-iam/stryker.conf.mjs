import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-iam',
  mutate: [
    'src/effective-permissions.component.ts',
    'src/group-create-dialog.component.ts',
    'src/group-detail.component.ts',
    'src/group-members-editor.component.ts',
    'src/group-roles-editor.component.ts',
    'src/groups-admin.component.ts',
    'src/iam-api.service.ts',
    'src/permission-matrix.component.ts',
    'src/provide-iam.ts',
    'src/role-create-dialog.component.ts',
    'src/role-detail.component.ts',
    'src/roles-admin.component.ts',
    'src/routes.ts',
    'src/user-create-dialog.component.ts',
    'src/user-detail.component.ts',
    'src/user-disable-confirm-dialog.component.ts',
    'src/users-admin.component.ts',
  ],
});
