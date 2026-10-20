/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JsonValue } from './JsonValue';
import type { TenantState } from './TenantState';
export type TenantDetail = {
  archivedAt?: string | null;
  createdAt: string;
  id: string;
  isActive: boolean;
  locale?: string | null;
  name: string;
  settings: Record<string, JsonValue>;
  slug: string;
  state: TenantState;
  suspendedReason?: string | null;
  timezone?: string | null;
  updatedAt: string;
};
