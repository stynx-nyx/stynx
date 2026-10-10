/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateRecordNoteDto = {
    code: string;
    detail: string;
    detail2?: (string | null);
    kind: 'primary' | 'secondary' | 'internal';
    label: string;
    locale?: string;
    recordId: string;
    region: string;
};

