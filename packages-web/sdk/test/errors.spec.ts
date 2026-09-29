import { describe, expect, it } from 'vitest';
import {
  createStynxSdkError,
  UnauthorizedError,
  ValidationError,
} from '../src/errors';

describe('createStynxSdkError envelope compatibility', () => {
  it('maps the legacy code/context envelope unchanged', () => {
    const payload = { code: 'AUTH:UNAUTHENTICATED:expired', message: 'Expired', context: { source: 'legacy' } };
    const error = createStynxSdkError(401, payload);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toMatchObject({
      status: 401,
      code: 'AUTH:UNAUTHENTICATED:expired',
      message: 'Expired',
      context: { source: 'legacy' },
      responseBody: payload,
    });
  });

  it('maps law errorCode/details/requestId into the safe SDK fields', () => {
    const payload = {
      statusCode: 422,
      errorCode: 'INPUT:INVALID:field',
      code: 'LEGACY_CODE',
      message: 'Invalid field',
      requestId: 'req-7',
      details: { field: 'name' },
    };
    const error = createStynxSdkError(422, payload);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      status: 422,
      code: 'INPUT:INVALID:field',
      message: 'Invalid field',
      context: { field: 'name', requestId: 'req-7' },
      responseBody: payload,
    });
  });

  it('keeps explicit legacy context and makes requestId available without overriding it', () => {
    const error = createStynxSdkError(400, {
      code: 'BAD_REQUEST',
      context: { requestId: 'context-id', detail: 'kept' },
      requestId: 'envelope-id',
      details: { ignored: true },
    });

    expect(error.context).toEqual({ requestId: 'context-id', detail: 'kept' });
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('adds the sibling requestId to legacy context when context has no requestId', () => {
    const error = createStynxSdkError(400, {
      code: 'BAD_REQUEST',
      context: { detail: 'kept' },
      requestId: 'envelope-id',
    });

    expect(error.context).toEqual({ detail: 'kept', requestId: 'envelope-id' });
  });

  it('uses details when legacy context is absent and preserves base construction', () => {
    const error = createStynxSdkError(418, {
      errorCode: 'X_VALIDATION_ERROR',
      details: { requestId: 'req-8', field: 'age' },
    });

    expect(error).toMatchObject({
      status: 418,
      code: 'X_VALIDATION_ERROR',
      context: { requestId: 'req-8', field: 'age' },
    });
  });

  it('preserves a requestId already present in details over the sibling envelope value', () => {
    const error = createStynxSdkError(400, {
      errorCode: 'INPUT:INVALID:field',
      requestId: 'envelope-id',
      details: { requestId: 'details-id', field: 'email' },
    });

    expect(error.context).toEqual({ requestId: 'details-id', field: 'email' });
  });

  it('creates context from the sibling requestId when details are absent', () => {
    const error = createStynxSdkError(418, { requestId: 'envelope-id' });

    expect(error.context).toEqual({ requestId: 'envelope-id' });
  });
});
