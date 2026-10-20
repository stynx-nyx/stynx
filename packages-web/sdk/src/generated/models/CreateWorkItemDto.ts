/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateWorkItemDto = {
  category?: string;
  code: string;
  createdByUserId?: string | null;
  openedOn: string;
  recordId: string;
  status?: 'draft' | 'ready' | 'done' | 'cancelled';
  targetOn: string;
  totalUnits?: number;
};
