/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlowJsonObject } from './FlowJsonObject';
import type { FlowQuestionFieldType } from './FlowQuestionFieldType';
import type { JsonValue } from './JsonValue';
export type CreateFlowQuestionDto = {
    blocksSubmit?: boolean;
    fieldType: FlowQuestionFieldType;
    formId: string;
    key: string;
    label: string;
    meta?: FlowJsonObject;
    options?: Array<JsonValue>;
    required?: boolean;
    sortOrder?: number;
    validators?: FlowJsonObject;
    visibleIf?: FlowJsonObject;
};

