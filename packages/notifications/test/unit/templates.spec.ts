import { describe, expect, it } from 'vitest';
import { NotificationTemplateNotFoundError, NotificationValidationError } from '../../src/errors.js';
import { notificationRecipientSchema, notifyRequestSchema } from '../../src/schema.js';
import { NotificationTemplateRegistry } from '../../src/templates/registry.js';

describe('notification contracts', () => {
  it('accepts a closed E.164 recipient and rejects undeclared request fields', () => {
    expect(notificationRecipientSchema.parse({ subjectId: 'subject-1', phone: '+5511999999999' })).toMatchObject({ subjectId: 'subject-1' });
    expect(() => notifyRequestSchema.parse({ recipient: { subjectId: 's' }, category: 'inf.notice', templateId: 'notice', locale: 'pt-BR', unknown: true })).toThrow();
  });

  it('resolves a requested immutable template version', () => {
    const registry = new NotificationTemplateRegistry();
    registry.register({ id: 'inf.notice', version: 1, supportedChannels: ['email'], bodyKey: 'notifications.example.body' });
    registry.register({ id: 'inf.notice', version: 2, supportedChannels: ['email', 'inapp'], bodyKey: 'notifications.example.body' });
    expect(registry.resolve('inf.notice').version).toBe(2);
    expect(registry.resolve('inf.notice', 1).version).toBe(1);
    expect(() => registry.resolve('absent')).toThrow(NotificationTemplateNotFoundError);
  });

  it('rejects duplicate template versions', () => {
    const registry = new NotificationTemplateRegistry();
    registry.register({ id: 'inf.notice', version: 1, supportedChannels: ['email'], bodyKey: 'notifications.example.body' });
    expect(() => registry.register({ id: 'inf.notice', version: 1, supportedChannels: ['email'], bodyKey: 'notifications.example.body' })).toThrow(NotificationValidationError);
  });

  it.each(['email', 'sms', 'push', 'inapp'])('retains declared channel %s without enum coercion', (channel) => {
    const parsed = notifyRequestSchema.parse({ recipient: { subjectId: 'subject-1' }, category: 'inf.notice', templateId: 'notice', locale: 'en', channels: [channel] });
    expect(parsed.channels).toEqual([channel]);
  });

  it.each(['EMAIL', 'custom', '', null, 0])('retains refusal of unsupported channel %j', (channel) => {
    expect(() => notifyRequestSchema.parse({ recipient: { subjectId: 'subject-1' }, category: 'inf.notice', templateId: 'notice', locale: 'en', channels: [channel] })).toThrow();
  });

});
