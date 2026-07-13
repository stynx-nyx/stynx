import { HttpException } from '@nestjs/common';
export type PreferencesErrorCode =
  | 'PREFERENCES_INVALID'
  | 'PREFERENCES_CONTEXT_OVERRIDE'
  | 'PREFERENCES_FORBIDDEN_FIELD'
  | 'PREFERENCES_UNAUTHENTICATED'
  | 'PREFERENCES_FORBIDDEN'
  | 'PREFERENCES_CATEGORY_NOT_FOUND'
  | 'PREFERENCES_REVISION_CONFLICT'
  | 'PREFERENCES_PRECONDITION_REQUIRED'
  | 'PREFERENCES_TOO_LARGE';
export class PreferencesError extends HttpException {
  readonly code: PreferencesErrorCode;
  constructor(code: PreferencesErrorCode, status: number, fields: string[] = []) {
    super({ code, message: code, ...(fields.length ? { fields } : {}) }, status);
    this.code = code;
  }
}
