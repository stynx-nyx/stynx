import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CatalogService } from '@stynx-nyx/i18n';
import { NotificationValidationError } from '../errors';
import type { NotificationTemplate, RenderedContent } from './types';

const MAX_INAPP_TITLE_LENGTH = 120;

/**
 * Renders a template's subject/body/in-app-title through the shared i18n catalog.
 *
 * `@stynx-nyx/notifications` does not import `StynxI18nModule` itself (that module
 * mounts app-global interceptors/filters/routes and must only be registered once, at
 * the application root). `CatalogService` is instead resolved lazily through
 * `ModuleRef` with `strict: false`, the same cross-module lookup `packages/storage`
 * uses for `Database` — the host app must import `StynxI18nModule.forRoot()` itself.
 *
 * PII note: `variables` frequently carries recipient-identifying content (names, case
 * numbers, addresses). Rendered strings and raw variables MUST NOT be passed to
 * `StynxLogger` as message text; callers only log ids, template id/version, channel,
 * and status. See `docs/framework/contracts/notifications-api.md#pii-and-logging`.
 */
@Injectable()
export class NotificationTemplateRenderer {
  constructor(private readonly moduleRef: ModuleRef) {}

  render(
    template: NotificationTemplate,
    locale: string,
    variables: Record<string, unknown>,
    tenantId?: string,
  ): RenderedContent {
    this.assertRequiredVariables(template, variables);
    const catalog = this.requireCatalog();

    const subject = template.subjectKey
      ? catalog.translate(template.subjectKey, locale, variables, tenantId)
      : undefined;
    const body = catalog.translate(template.bodyKey, locale, variables, tenantId);
    const inAppTitle = template.inAppTitleKey
      ? catalog.translate(template.inAppTitleKey, locale, variables, tenantId)
      : (subject ?? this.truncate(body, MAX_INAPP_TITLE_LENGTH));

    return { ...(subject === undefined ? {} : { subject }), body, inAppTitle };
  }

  private requireCatalog(): CatalogService {
    const catalog = this.moduleRef.get(CatalogService, { strict: false });
    if (!catalog) {
      throw new Error(
        'CatalogService is unavailable to NotificationTemplateRenderer; import StynxI18nModule.forRoot() at the application root',
      );
    }
    return catalog;
  }

  private assertRequiredVariables(
    template: NotificationTemplate,
    variables: Record<string, unknown>,
  ): void {
    const missing = (template.requiredVariables ?? []).filter(
      (name) => !Object.hasOwn(variables, name),
    );
    if (missing.length > 0) {
      throw new NotificationValidationError('Missing required template variables', {
        templateId: template.id,
        missing,
      });
    }
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
  }
}
