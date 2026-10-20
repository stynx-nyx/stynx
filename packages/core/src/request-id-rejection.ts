import { BadRequestException } from '@nestjs/common';

/** Message key of the 400 returned when `X-Request-Id` is missing or not a UUIDv7. */
export const REQUEST_ID_INVALID_MESSAGE_KEY = 'REQUEST_ID_INVALID';

/**
 * The single rejection for a missing or invalid `X-Request-Id` (S-70, D-014).
 * Every request must carry a client-minted UUIDv7; STYNX never synthesises
 * one. The body carries exactly `code`, `messageKey` and `requestId`, with
 * `requestId: null` because no valid id exists to echo.
 */
export function requestIdRejection(): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION',
    messageKey: REQUEST_ID_INVALID_MESSAGE_KEY,
    requestId: null,
  });
}
