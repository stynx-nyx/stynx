// C-4 Session S3-2 — minimal BookmarkPolicyGuard stub
//
// The scaffolded controllers reference this guard but the scaffolder
// never emitted it (D-A-15). Authored as a stub here so the module
// type-checks.
//
// Hand-finishing for S3-2-step-2:
//   - Replace this stub with a thin shim over @stynx/auth's StynxAuthGuard
//     + PermissionGuard (the canonical stynx pattern — see
//     reference/api/src/sample/records.controller.ts line 45-46), OR
//   - Delete this file and update the controllers to use
//     @UseGuards(StynxAuthGuard, PermissionGuard) directly.
//
// The current implementation rejects everything (canActivate returns false)
// to force callers to wire real authz before this module ever serves traffic.

import { CanActivate, Injectable } from '@nestjs/common';

@Injectable()
export class BookmarkPolicyGuard implements CanActivate {
  canActivate(): boolean {
    // Deny-by-default until S3-2-step-2 wires the @stynx/auth guards.
    // If you see this in a real request log, the module is unfinished.
    return false;
  }
}
