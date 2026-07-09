**@stynx-nyx/tenancy**

---

# @stynx-nyx/tenancy

Public tenancy exports for tenant context, membership cache, platform admin, and services.

## Classes

- [MembershipAccessCache](classes/MembershipAccessCache.md)
- [StynxTenancyModule](classes/StynxTenancyModule.md)
- [TenancyController](classes/TenancyController.md)
- [TenancyPlatformAdminGuard](classes/TenancyPlatformAdminGuard.md)
- [TenancyService](classes/TenancyService.md)
- [TenantContextInterceptor](classes/TenantContextInterceptor.md)
- [TenantSystemOperationSink](classes/TenantSystemOperationSink.md)

## Interfaces

- [ArchiveTenantResult](interfaces/ArchiveTenantResult.md)
- [ProvisionTenantInput](interfaces/ProvisionTenantInput.md)
- [ProvisionTenantResult](interfaces/ProvisionTenantResult.md)
- [PurgeTenantResult](interfaces/PurgeTenantResult.md)
- [RequestLike](interfaces/RequestLike.md)
- [ResolvedStynxTenancyModuleOptions](interfaces/ResolvedStynxTenancyModuleOptions.md)
- [StynxTenancyModuleOptions](interfaces/StynxTenancyModuleOptions.md)
- [SuspendTenantInput](interfaces/SuspendTenantInput.md)
- [SuspendTenantResult](interfaces/SuspendTenantResult.md)
- [TenantArchiveExporter](interfaces/TenantArchiveExporter.md)
- [TenantDetail](interfaces/TenantDetail.md)
- [TenantInviteSender](interfaces/TenantInviteSender.md)
- [TenantPrefixProvisioner](interfaces/TenantPrefixProvisioner.md)
- [TenantPurgeDelegate](interfaces/TenantPurgeDelegate.md)
- [TenantSummary](interfaces/TenantSummary.md)
- [UpdateTenantInput](interfaces/UpdateTenantInput.md)

## Type Aliases

- [TenantState](type-aliases/TenantState.md)

## Variables

- [OPTIONAL_TENANCY_PATHS](variables/OPTIONAL_TENANCY_PATHS.md)
- [STYNX_TENANCY_OPTIONS](variables/STYNX_TENANCY_OPTIONS.md)
- [STYNX_TENANT_ARCHIVE_EXPORTER](variables/STYNX_TENANT_ARCHIVE_EXPORTER.md)
- [STYNX_TENANT_INVITE_SENDER](variables/STYNX_TENANT_INVITE_SENDER.md)
- [STYNX_TENANT_MEMBERSHIP_CACHE](variables/STYNX_TENANT_MEMBERSHIP_CACHE.md)
- [STYNX_TENANT_PREFIX_PROVISIONER](variables/STYNX_TENANT_PREFIX_PROVISIONER.md)
- [STYNX_TENANT_PURGE_DELEGATE](variables/STYNX_TENANT_PURGE_DELEGATE.md)
- [TENANT_SYSTEM_OPERATION_SINK_PROVIDER](variables/TENANT_SYSTEM_OPERATION_SINK_PROVIDER.md)

## Functions

- [createUuidV7](functions/createUuidV7.md)
- [headerToString](functions/headerToString.md)
- [isOptionalTenancyPath](functions/isOptionalTenancyPath.md)
- [isUuidV7](functions/isUuidV7.md)
- [normalizedPath](functions/normalizedPath.md)
- [parseBearerTenantClaims](functions/parseBearerTenantClaims.md)
- [resolveSubdomainTenantId](functions/resolveSubdomainTenantId.md)
- [resolveTenancyOptions](functions/resolveTenancyOptions.md)
