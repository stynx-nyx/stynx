/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SessionScope } from './SessionScope';
export type SessionControlCapabilities = {
  controlScopes: Array<SessionScope>;
  identityGlobalAuthority: boolean;
  listScopes: Array<SessionScope>;
  localEnforcement: 'immediate' | 'bounded' | 'none';
  providerConfirmation: boolean;
  retryReconciliation: boolean;
  revokeAll: boolean;
  revokeOne: boolean;
  revokeOthers: boolean;
  sharedAnchorBlastRadius: boolean;
  stableSessionIdentity: boolean;
};
