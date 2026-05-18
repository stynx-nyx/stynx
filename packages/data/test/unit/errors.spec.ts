import {
  ReadOnlyViolationError,
  SerializationFailureError,
  StatementTimeoutError,
  StynxDataError,
} from '../../src/errors';

describe('data errors', () => {
  it('supports direct StynxDataError construction', () => {
    const error = new StynxDataError('custom data failure', {
      code: 'CUSTOM_DATA_FAILURE',
      status: 418,
    });

    expect(error).toMatchObject({
      message: 'custom data failure',
      code: 'CUSTOM_DATA_FAILURE',
      status: 418,
    });
  });

  it('omits context on optional-context errors when no context is provided', () => {
    for (const ErrorClass of [ReadOnlyViolationError, StatementTimeoutError, SerializationFailureError]) {
      const error = new ErrorClass();

      expect(error.context).toBeUndefined();
    }
  });
});
