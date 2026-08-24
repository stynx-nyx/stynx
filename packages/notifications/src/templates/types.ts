import type { NotificationChannel } from '../types';

/**
 * A versioned, code-registered notification template.
 *
 * Subject/body strings are ICU MessageFormat i18n catalog keys, resolved through
 * `@stynx-nyx/i18n`'s `CatalogService` against `packages/notifications/i18n/<locale>.json`.
 * Body-only channels (sms/push/inapp-title) fall back to `bodyKey` when a channel-specific
 * key is not declared.
 */
export interface NotificationTemplate {
  id: string;
  version: number;
  /** Channels this template has content for. A NotifyRequest MUST NOT request others. */
  supportedChannels: readonly NotificationChannel[];
  subjectKey?: string;
  bodyKey: string;
  /** In-app inbox title; defaults to the rendered subject, then a truncated body. */
  inAppTitleKey?: string;
  /** Required variable names; enqueue MUST supply all of them (values may be falsy). */
  requiredVariables?: readonly string[];
}

export interface RenderedContent {
  subject?: string;
  body: string;
  inAppTitle: string;
}

export interface TemplateRegistry {
  register(template: NotificationTemplate): void;
  resolve(templateId: string, version?: number): NotificationTemplate;
  latestVersion(templateId: string): number;
}
