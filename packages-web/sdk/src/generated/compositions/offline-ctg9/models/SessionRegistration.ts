/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RegistrationState } from './RegistrationState';
import type { SessionControlCapabilities } from './SessionControlCapabilities';
import type { SessionDisplayMetadata } from './SessionDisplayMetadata';
import type { SessionGuarantee } from './SessionGuarantee';
export type SessionRegistration = {
  anchorId: string;
  capabilities: SessionControlCapabilities;
  createdAt: string;
  expiresAt: string | null;
  guarantee: SessionGuarantee;
  lastSeenAt: string | null;
  metadata: SessionDisplayMetadata;
  provider: string;
  sharedAnchor: boolean;
  sid: string;
  state: RegistrationState;
  subjectId: string;
  tenantId: string;
  terminalAt: string | null;
};
