**@stynx-nyx/logging**

---

# @stynx-nyx/logging

Public structured logging, Pino factory, request middleware, and dedupe exports.

## Classes

- [LoggingDedupeService](classes/LoggingDedupeService.md)
- [RequestLogFieldFactory](classes/RequestLogFieldFactory.md)
- [RequestLoggingMiddleware](classes/RequestLoggingMiddleware.md)
- [StynxLogger](classes/StynxLogger.md)
- [StynxLoggingModule](classes/StynxLoggingModule.md)

## Interfaces

- [DedupeDecision](interfaces/DedupeDecision.md)
- [RequestLike](interfaces/RequestLike.md)
- [RequestScopedLogFields](interfaces/RequestScopedLogFields.md)
- [ResponseLike](interfaces/ResponseLike.md)
- [StynxLoggingOptions](interfaces/StynxLoggingOptions.md)

## Type Aliases

- [LogContext](type-aliases/LogContext.md)
- [Next](type-aliases/Next.md)

## Variables

- [DEFAULT_REDACT_PATHS](variables/DEFAULT_REDACT_PATHS.md)
- [STYNX_LOGGING_OPTIONS](variables/STYNX_LOGGING_OPTIONS.md)
- [STYNX_PINO_LOGGER](variables/STYNX_PINO_LOGGER.md)

## Functions

- [createPinoLogger](functions/createPinoLogger.md)
- [resolveRedactPaths](functions/resolveRedactPaths.md)
