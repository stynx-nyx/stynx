/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateWorkItemDto = {
    category?: string;
    code?: string;
    createdByUserId?: (string | null);
    openedOn?: string;
    recordId?: string;
    status?: 'draft' | 'ready' | 'done' | 'cancelled';
    targetOn?: string;
    totalUnits?: number;
};

