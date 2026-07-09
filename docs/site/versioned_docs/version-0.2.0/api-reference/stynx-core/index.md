**@stynx-nyx/core**

---

# @stynx-nyx/core

Public core runtime exports for request context, configuration, errors, and secrets.

## Classes

- [ConfigOwnershipViolationError](classes/ConfigOwnershipViolationError.md)
- [ConfigurationValidationError](classes/ConfigurationValidationError.md)
- [Database](classes/Database.md)
- [RequestContext](classes/RequestContext.md)
- [RequestContextInterceptor](classes/RequestContextInterceptor.md)
- [RequestContextMissingError](classes/RequestContextMissingError.md)
- [RequestContextMutationError](classes/RequestContextMutationError.md)
- [RequestContextMutator](classes/RequestContextMutator.md)
- [SecretLoader](classes/SecretLoader.md)
- [SecretLoadError](classes/SecretLoadError.md)
- [StynxConfigService](classes/StynxConfigService.md)
- [StynxCoreModule](classes/StynxCoreModule.md)
- [StynxError](classes/StynxError.md)
- [StynxErrorFilter](classes/StynxErrorFilter.md)
- [SystemContext](classes/SystemContext.md)
- [SystemContextRequiredError](classes/SystemContextRequiredError.md)

## Interfaces

- [ConfigKeyMetadata](interfaces/ConfigKeyMetadata.md)
- [ConfigViolation](interfaces/ConfigViolation.md)
- [ErrorTranslator](interfaces/ErrorTranslator.md)
- [RequestContextPatch](interfaces/RequestContextPatch.md)
- [RequestContextState](interfaces/RequestContextState.md)
- [StynxCoreModuleAsyncOptions](interfaces/StynxCoreModuleAsyncOptions.md)
- [StynxCoreModuleOptions](interfaces/StynxCoreModuleOptions.md)
- [StynxErrorOptions](interfaces/StynxErrorOptions.md)
- [StynxSsmOptions](interfaces/StynxSsmOptions.md)
- [SystemExecutionContext](interfaces/SystemExecutionContext.md)
- [SystemOperationRecord](interfaces/SystemOperationRecord.md)
- [SystemOperationSink](interfaces/SystemOperationSink.md)

## Type Aliases

- [AnnotatedSchema](type-aliases/AnnotatedSchema.md)
- [ConfigOwner](type-aliases/ConfigOwner.md)
- [CoreClsStore](type-aliases/CoreClsStore.md)

## Variables

- [STYNX_CORE_CONFIG](variables/STYNX_CORE_CONFIG.md)
- [STYNX_CORE_OPTIONS](variables/STYNX_CORE_OPTIONS.md)
- [STYNX_ERROR_TRANSLATOR](variables/STYNX_ERROR_TRANSLATOR.md)
- [STYNX_SYSTEM_OPERATION_SINK](variables/STYNX_SYSTEM_OPERATION_SINK.md)

## Functions

- [generateRequestId](functions/generateRequestId.md)
- [isRequestId](functions/isRequestId.md)
- [loadStynxConfiguration](functions/loadStynxConfiguration.md)
- [normalizeRequestId](functions/normalizeRequestId.md)
- [validateConfigOwnership](functions/validateConfigOwnership.md)
- [withSystemContext](functions/withSystemContext.md)
