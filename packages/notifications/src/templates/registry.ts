import { Injectable } from '@nestjs/common';
import { NotificationTemplateNotFoundError, NotificationValidationError } from '../errors';
import type { NotificationTemplate, TemplateRegistry } from './types';

/**
 * In-process, code-registered template store. Templates are registered at module
 * bootstrap (see `StynxNotificationsModule.forRoot({ templates })`) or via
 * `NotificationTemplateRegistry.register()` from a consuming domain module's own
 * providers. There is no database-backed template table: templates are reviewed and
 * versioned through the same git/PR process as the code that sends them, which keeps
 * a template change auditable and rollback-safe without a separate admin surface.
 */
@Injectable()
export class NotificationTemplateRegistry implements TemplateRegistry {
  private readonly byId = new Map<string, Map<number, NotificationTemplate>>();

  register(template: NotificationTemplate): void {
    if (!template.id || !/^[a-z][a-z0-9._-]*$/.test(template.id)) {
      throw new NotificationValidationError('Invalid template id', { templateId: template.id });
    }
    if (!Number.isInteger(template.version) || template.version < 1) {
      throw new NotificationValidationError('Template version must be a positive integer', {
        templateId: template.id,
        version: template.version,
      });
    }
    if (template.supportedChannels.length === 0) {
      throw new NotificationValidationError('Template must support at least one channel', {
        templateId: template.id,
      });
    }
    const versions = this.byId.get(template.id) ?? new Map<number, NotificationTemplate>();
    if (versions.has(template.version)) {
      throw new NotificationValidationError('Template version is already registered', {
        templateId: template.id,
        version: template.version,
      });
    }
    versions.set(template.version, template);
    this.byId.set(template.id, versions);
  }

  resolve(templateId: string, version?: number): NotificationTemplate {
    const versions = this.byId.get(templateId);
    if (!versions || versions.size === 0) {
      throw new NotificationTemplateNotFoundError(templateId, version);
    }
    const resolvedVersion = version ?? this.latestVersion(templateId);
    const template = versions.get(resolvedVersion);
    if (!template) {
      throw new NotificationTemplateNotFoundError(templateId, resolvedVersion);
    }
    return template;
  }

  latestVersion(templateId: string): number {
    const versions = this.byId.get(templateId);
    if (!versions || versions.size === 0) {
      throw new NotificationTemplateNotFoundError(templateId);
    }
    return Math.max(...versions.keys());
  }
}
