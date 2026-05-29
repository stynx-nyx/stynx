/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export type CreateRecordDto = {
    email: string;
    externalRef?: string;
    ownerUserId?: (string | null);
    status?: 'active' | 'pending' | 'inactive';
    title: string;
};

