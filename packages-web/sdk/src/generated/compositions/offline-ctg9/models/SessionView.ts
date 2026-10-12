/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { InvalidationGuarantee } from './InvalidationGuarantee';
import type { RegistrationState } from './RegistrationState';
import type { SessionControlCapabilities } from './SessionControlCapabilities';
export type SessionView = {
  capabilities: SessionControlCapabilities;
  client?: string;
  createdAt: string;
  current: boolean;
  deviceLabel?: string;
  expiresAt: string | null;
  guarantee: {
    effectiveBy: string | null;
    kind: InvalidationGuarantee;
    propagationBoundSeconds: number | null;
  };
  lastSeenAt: string | null;
  location?: {
    country?: string;
    region?: string;
  };
  provider: string;
  sessionId: string;
  sid: string;
  state: RegistrationState;
  tenantId: string;
  terminalAt: string | null;
  userAgent?: string;
};
