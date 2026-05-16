// C-4 Session S3-2 — @Resource / @Action decorator stubs
//
// The scaffolded controllers reference these but the scaffolder never
// emitted them (D-A-15). Authored as minimal SetMetadata wrappers so
// the controllers type-check.
//
// Hand-finishing for S3-2-step-2:
//   - Replace with @stynx/auth's @Permission decorator pattern (see
//     reference/api/src/sample/records.controller.ts for the canonical
//     stynx shape), OR
//   - Keep these and have BookmarkPolicyGuard.canActivate() read the
//     metadata + delegate to @stynx/auth's PermissionGuard.
//
// As-is, these decorators attach metadata but no guard consumes it.

import { SetMetadata } from '@nestjs/common';

export const RESOURCE_METADATA_KEY = 'bookmark:resource';
export const ACTION_METADATA_KEY = 'bookmark:action';

export const Resource = (name: string) => SetMetadata(RESOURCE_METADATA_KEY, name);
export const Action = (verb: string) => SetMetadata(ACTION_METADATA_KEY, verb);
