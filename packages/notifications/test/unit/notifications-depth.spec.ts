import { Database } from '@stynx-nyx/data';
import { CatalogService } from '@stynx-nyx/i18n';
import { PreferencesService } from '@stynx-nyx/preferences';
import {
  EmailSesChannelAdapter,
  InAppPostgresChannelAdapter,
  NotificationDeliveryNotFoundError,
  NotificationDispatchService,
  NotificationInboxService,
  NotificationNoRecipientAddressError,
  NotificationsService,
  NotificationTemplateNotFoundError,
  NotificationTemplateRegistry,
  NotificationTemplateRenderer,
  NotificationValidationError,
  PreferencesServicePreferencesPort,
  SmsSnsChannelAdapter,
  type ChannelAdapter,
} from '../../src';

const template = {
  id: 'inf.notice',
  version: 1,
  supportedChannels: ['email', 'sms', 'inapp', 'push'] as const,
  subjectKey: 'subject',
  bodyKey: 'body',
  inAppTitleKey: 'title',
  requiredVariables: ['name'],
};

function databaseWith(
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>,
) {
  const trx = { query: vi.fn(query) };
  const database = { tx: vi.fn(async (fn: (value: typeof trx) => unknown) => fn(trx)) };
  return { database, trx };
}

describe('notification service and adapter depth', () => {
  it('renders templates with subject, title, fallback, truncation, and validation', () => {
    const translate = vi.fn((key: string) =>
      key === 'body' ? 'x'.repeat(130) : `rendered:${key}`,
    );
    const renderer = new NotificationTemplateRenderer({
      get: (token: unknown) => (token === CatalogService ? { translate } : undefined),
    } as never);
    expect(renderer.render(template, 'en-US', { name: 'Ada' }, 'tenant-1')).toEqual({
      subject: 'rendered:subject',
      body: 'x'.repeat(130),
      inAppTitle: 'rendered:title',
    });
    expect(
      renderer.render({ ...template, subjectKey: undefined, inAppTitleKey: undefined }, 'en-US', {
        name: 'Ada',
      }).inAppTitle,
    ).toBe(`${'x'.repeat(119)}…`);
    expect(
      renderer.render(
        { ...template, subjectKey: 'subject', inAppTitleKey: undefined, bodyKey: 'short' },
        'en-US',
        { name: 'Ada' },
      ).inAppTitle,
    ).toBe('rendered:subject');
    expect(
      renderer.render(
        {
          ...template,
          subjectKey: undefined,
          inAppTitleKey: undefined,
          requiredVariables: undefined,
          bodyKey: 'short',
        },
        'en-US',
        {},
      ).inAppTitle,
    ).toBe('rendered:short');
    expect(() => renderer.render(template, 'en-US', {})).toThrow(NotificationValidationError);
    expect(() =>
      new NotificationTemplateRenderer({ get: () => undefined } as never).render(
        { ...template, requiredVariables: [] },
        'en-US',
        {},
      ),
    ).toThrow('CatalogService is unavailable');
  });

  it('covers registry validation and all notification error constructors', () => {
    const registry = new NotificationTemplateRegistry();
    for (const invalid of [
      { ...template, id: '' },
      { ...template, id: 'Bad' },
      { ...template, version: 0 },
      { ...template, version: 1.5 },
      { ...template, supportedChannels: [] },
    ])
      expect(() => registry.register(invalid as never)).toThrow(NotificationValidationError);
    registry.register(template);
    expect(registry.latestVersion(template.id)).toBe(1);
    expect(() => registry.resolve(template.id, 2)).toThrow(NotificationTemplateNotFoundError);
    expect(() => registry.latestVersion('missing')).toThrow(NotificationTemplateNotFoundError);
    for (const error of [
      new NotificationValidationError('invalid'),
      new NotificationValidationError('invalid', { field: 'x' }),
      new NotificationTemplateNotFoundError('missing'),
      new NotificationTemplateNotFoundError('missing', 2),
      new NotificationNoRecipientAddressError('email'),
      new NotificationDeliveryNotFoundError('delivery-1'),
    ])
      expect(error.code).toMatch(/^NOTIFICATIONS_/);
  });

  it('uses open preference defaults or the configured preferences document', async () => {
    const absent = new PreferencesServicePreferencesPort({ get: () => undefined } as never);
    await expect(absent.read('tenant-1', 'subject-1')).resolves.toEqual({
      email: true,
      push: true,
      inApp: true,
    });
    const getPreferences = vi.fn(async () => ({
      values: { notificationDelivery: { email: false, push: true, inApp: false } },
    }));
    const present = new PreferencesServicePreferencesPort({
      get: (token: unknown) => (token === PreferencesService ? { getPreferences } : undefined),
    } as never);
    await expect(present.read('tenant-1', 'subject-1')).resolves.toEqual({
      email: false,
      push: true,
      inApp: false,
    });
  });

  it('enqueues preference-aware delivery rows and reuses correlated results', async () => {
    const registry = new NotificationTemplateRegistry();
    registry.register(template);
    const { database, trx } = databaseWith(async (sql) => {
      if (sql.includes('select id from notifications.notifications')) return { rows: [] };
      return { rows: [] };
    });
    const service = new NotificationsService(
      { get: (token: unknown) => (token === Database ? database : undefined) } as never,
      { tenantId: 'tenant-1', actorId: 'actor-1' } as never,
      registry,
      { read: vi.fn(async () => ({ email: false, push: true, inApp: true })) },
    );
    const result = await service.enqueue({
      recipient: { subjectId: 'subject-1', email: 'ada@example.test', phone: '+5511999999999' },
      category: 'inf.notice',
      templateId: template.id,
      locale: 'en-US',
      variables: { name: 'Ada' },
      channels: ['email', 'sms'],
      correlationId: 'correlation-1',
    });
    expect(result.deliveries.map(({ channel, status }) => [channel, status])).toEqual([
      ['email', 'SUPPRESSED'],
      ['sms', 'QUEUED'],
    ]);
    expect(trx.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into notifications.notifications'),
      expect.any(Array),
    );

    const correlatedDb = databaseWith(async (sql) =>
      sql.includes('select id from notifications.notifications')
        ? { rows: [{ id: 'notification-existing' }] }
        : { rows: [{ id: 'delivery-existing', channel: 'push', status: 'QUEUED' }] },
    );
    const correlated = new NotificationsService(
      { get: () => correlatedDb.database } as never,
      { tenantId: 'tenant-1' } as never,
      registry,
      { read: vi.fn() },
    );
    await expect(
      correlated.enqueue({
        recipient: { subjectId: 'subject-1' },
        category: 'inf.notice',
        templateId: template.id,
        locale: 'en-US',
        variables: { name: 'Ada' },
        correlationId: 'correlation-1',
      }),
    ).resolves.toEqual({
      notificationId: 'notification-existing',
      deliveries: [{ channel: 'push', deliveryId: 'delivery-existing', status: 'QUEUED' }],
    });

    const defaultsDb = databaseWith(async () => ({ rows: [] }));
    const defaults = new NotificationsService(
      { get: () => defaultsDb.database } as never,
      { tenantId: 'tenant-1' } as never,
      registry,
      { read: vi.fn(async () => ({ email: true, push: true, inApp: true })) },
    );
    await expect(
      defaults.enqueue({
        recipient: { subjectId: 'subject-1' },
        category: 'inf.notice',
        templateId: template.id,
        locale: 'en-US',
      }),
    ).resolves.toMatchObject({
      deliveries: expect.arrayContaining([
        expect.objectContaining({ channel: 'email', status: 'QUEUED' }),
        expect.objectContaining({ channel: 'sms', status: 'QUEUED' }),
      ]),
    });
  });

  it('rejects invalid, unsupported, tenantless, and database-less enqueue requests', async () => {
    const registry = new NotificationTemplateRegistry();
    registry.register(template);
    const make = (tenantId?: string, database?: unknown) =>
      new NotificationsService({ get: () => database } as never, { tenantId } as never, registry, {
        read: vi.fn(async () => ({ email: true, push: true, inApp: true })),
      });
    await expect(make('tenant-1', {}).enqueue({} as never)).rejects.toThrow(
      NotificationValidationError,
    );
    await expect(
      make(undefined, {}).enqueue({
        recipient: { subjectId: 'subject-1' },
        category: 'inf.notice',
        templateId: template.id,
        locale: 'en-US',
        variables: { name: 'Ada' },
      }),
    ).rejects.toThrow('Tenant context is required');
    await expect(
      make('tenant-1').enqueue({
        recipient: { subjectId: 'subject-1' },
        category: 'inf.notice',
        templateId: template.id,
        locale: 'en-US',
        variables: { name: 'Ada' },
      }),
    ).rejects.toThrow('Database provider is unavailable');
    const emailOnly = new NotificationTemplateRegistry();
    emailOnly.register({ ...template, supportedChannels: ['email'] });
    const unsupported = new NotificationsService(
      { get: () => databaseWith(async () => ({ rows: [] })).database } as never,
      { tenantId: 'tenant-1' } as never,
      emailOnly,
      { read: vi.fn(async () => ({ email: true, push: true, inApp: true })) },
    );
    await expect(
      unsupported.enqueue({
        recipient: { subjectId: 'subject-1' },
        category: 'inf.notice',
        templateId: template.id,
        locale: 'en-US',
        variables: { name: 'Ada' },
        channels: ['push'],
      }),
    ).rejects.toThrow('Template does not support');
  });

  it('lists and marks inbox rows while enforcing tenant and database boundaries', async () => {
    const item = { id: 'inbox-1' };
    const { database, trx } = databaseWith(async (sql) => ({
      rows: sql.includes('select id') ? [item] : [],
    }));
    const inbox = new NotificationInboxService(
      { get: () => database } as never,
      { tenantId: 'tenant-1' } as never,
    );
    await expect(
      inbox.list({ subjectId: 'subject-1', unreadOnly: true, limit: 999 }),
    ).resolves.toEqual([item]);
    await expect(inbox.list({ subjectId: 'subject-1' })).resolves.toEqual([item]);
    await inbox.markRead('inbox-1');
    expect(trx.query).toHaveBeenCalledWith(
      expect.stringContaining('update notifications.inbox_items'),
      ['inbox-1', 'tenant-1'],
    );
    await expect(
      new NotificationInboxService(
        { get: () => undefined } as never,
        { tenantId: 'tenant-1' } as never,
      ).list({ subjectId: 'subject-1' }),
    ).rejects.toThrow('Database provider is unavailable');
    await expect(
      new NotificationInboxService({ get: () => database } as never, {} as never).list({
        subjectId: 'subject-1',
      }),
    ).rejects.toThrow('Tenant context is required');
  });

  it('persists in-app messages and exercises SES/SNS channel outcomes', async () => {
    const { database } = databaseWith(async () => ({ rows: [] }));
    const input = {
      deliveryId: 'delivery-1',
      notificationId: 'notification-1',
      tenantId: 'tenant-1',
      recipient: { subjectId: 'subject-1', email: 'ada@example.test', phone: '+5511999999999' },
      subject: 'Subject',
      body: 'Body',
      locale: 'en-US',
    };
    await expect(
      new InAppPostgresChannelAdapter({ get: () => database } as never).send(input),
    ).resolves.toEqual({ status: 'DELIVERED' });
    await expect(
      new InAppPostgresChannelAdapter({ get: () => database } as never).send({
        ...input,
        subject: undefined,
      }),
    ).resolves.toEqual({ status: 'DELIVERED' });
    await expect(
      new InAppPostgresChannelAdapter({ get: () => undefined } as never).send(input),
    ).rejects.toThrow('Database provider is unavailable');

    await expect(new EmailSesChannelAdapter({} as never).send(input)).resolves.toMatchObject({
      errorCode: 'SES_NOT_CONFIGURED',
    });
    const email = new EmailSesChannelAdapter({
      ses: { fromAddress: 'from@example.test', region: 'us-east-1', configurationSetName: 'set' },
    } as never);
    (email as unknown as { client: { send: ReturnType<typeof vi.fn> } }).client.send = vi.fn(
      async () => ({ MessageId: 'ses-1' }),
    );
    await expect(email.send(input)).resolves.toEqual({
      status: 'SENT',
      providerMessageId: 'ses-1',
    });
    await expect(email.send({ ...input, recipient: { subjectId: 'subject-1' } })).rejects.toThrow(
      NotificationNoRecipientAddressError,
    );

    const sms = new SmsSnsChannelAdapter({
      sns: { senderId: 'STYNX', region: 'us-east-1' },
    } as never);
    (sms as unknown as { client: { send: ReturnType<typeof vi.fn> } }).client.send = vi.fn(
      async () => ({ MessageId: 'sns-1' }),
    );
    await expect(sms.send(input)).resolves.toEqual({ status: 'SENT', providerMessageId: 'sns-1' });
    await expect(sms.send({ ...input, recipient: { subjectId: 'subject-1' } })).rejects.toThrow(
      NotificationNoRecipientAddressError,
    );

    const failingEmail = new EmailSesChannelAdapter({
      ses: { fromAddress: 'from@example.test', endpoint: 'http://ses.test' },
    } as never);
    (
      failingEmail as unknown as { integration: { execute: ReturnType<typeof vi.fn> } }
    ).integration.execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('ses down'))
      .mockRejectedValueOnce('ses down');
    await expect(failingEmail.send({ ...input, subject: undefined })).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'SES_SEND_FAILED',
      errorDetail: 'Error',
    });
    await expect(failingEmail.send(input)).resolves.toMatchObject({ errorDetail: 'unknown_error' });
    (failingEmail as unknown as { client: { send: ReturnType<typeof vi.fn> } }).client.send = vi.fn(
      async () => ({}),
    );
    await expect(
      (failingEmail as unknown as { sendEmail(value: typeof input): Promise<unknown> }).sendEmail({
        ...input,
        subject: undefined,
      }),
    ).resolves.toEqual({ status: 'SENT' });

    const failingSms = new SmsSnsChannelAdapter({ sns: { endpoint: 'http://sns.test' } } as never);
    (
      failingSms as unknown as { integration: { execute: ReturnType<typeof vi.fn> } }
    ).integration.execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('sns down'))
      .mockRejectedValueOnce('sns down');
    await expect(failingSms.send(input)).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'SNS_PUBLISH_FAILED',
      errorDetail: 'Error',
    });
    await expect(failingSms.send(input)).resolves.toMatchObject({ errorDetail: 'unknown_error' });
    (failingSms as unknown as { client: { send: ReturnType<typeof vi.fn> } }).client.send = vi.fn(
      async () => ({}),
    );
    await expect(
      (failingSms as unknown as { publish(value: typeof input): Promise<unknown> }).publish(input),
    ).resolves.toEqual({ status: 'SENT' });
  });

  it('dispatches mixed delivery outcomes with bounded retry persistence and safe logs', async () => {
    const rows = ['email', 'sms', 'inapp', 'push'].map((channel, index) => ({
      id: `delivery-${index}`,
      tenant_id: 'tenant-1',
      notification_id: 'notification-1',
      channel,
      attempt_count: 0,
      max_attempts: 5,
      recipient_subject_id: 'subject-1',
      recipient_email: channel === 'email' ? 'ada@example.test' : null,
      recipient_phone: channel === 'sms' ? '+5511999999999' : null,
      recipient_push_token: channel === 'push' ? 'token' : null,
      template_id: template.id,
      template_version: 1,
      locale: 'en-US',
      variables: { name: 'Ada' },
    }));
    let claimed = false;
    const { database } = databaseWith(async (sql) => {
      if (sql.includes('select d.id') && !claimed) {
        claimed = true;
        return { rows };
      }
      return { rows: [] };
    });
    const adapters = new Map<string, ChannelAdapter>([
      [
        'email',
        {
          channel: 'email',
          send: vi.fn(async () => ({ status: 'SENT', providerMessageId: 'provider-1' })),
        },
      ],
      [
        'sms',
        {
          channel: 'sms',
          send: vi.fn(async () => {
            throw new Error('provider down');
          }),
        },
      ],
      [
        'inapp',
        {
          channel: 'inapp',
          send: vi.fn(async () => ({ status: 'FAILED', errorCode: 'temporary' })),
        },
      ],
    ]);
    const logger = { log: vi.fn() };
    const service = new NotificationDispatchService(
      { get: () => database } as never,
      { resolve: () => template } as never,
      { render: () => ({ subject: 'Subject', body: 'Body', inAppTitle: 'Title' }) } as never,
      adapters as never,
      {
        retryPolicies: {
          inapp: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 20, jitterRatio: 0 },
        },
      } as never,
      logger as never,
    );
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await expect(
      service.dispatchDue({ batchSize: 999, now: new Date('2026-08-25T00:00:00Z') }),
    ).resolves.toMatchObject({
      claimed: 4,
      outcomes: [
        { channel: 'email', status: 'SENT' },
        { channel: 'sms', status: 'QUEUED' },
        { channel: 'inapp', status: 'QUEUED' },
        { channel: 'push', status: 'FAILED' },
      ],
    });
    expect(random).toHaveBeenCalledWith();
    expect(logger.log).toHaveBeenCalledTimes(4);
    const pushDb = databaseWith(async (sql) =>
      sql.includes('select d.id')
        ? {
            rows: [
              {
                ...rows[3],
                id: 'delivery-push-with-adapter',
              },
            ],
          }
        : { rows: [] },
    );
    const pushAdapter = { channel: 'push', send: vi.fn(async () => Promise.reject('push down')) };
    const pushDispatch = new NotificationDispatchService(
      { get: () => pushDb.database } as never,
      { resolve: () => template } as never,
      { render: () => ({ subject: undefined, body: 'Body', inAppTitle: 'Title' }) } as never,
      new Map([['push', pushAdapter]]) as never,
      {} as never,
    );
    await expect(pushDispatch.dispatchDue()).resolves.toMatchObject({
      outcomes: [{ channel: 'push', status: 'QUEUED' }],
    });
    expect(
      (
        pushDispatch as unknown as {
          retryDelay(policy: { maxAttempts: number; baseDelayMs: number }, attempt: number): number;
        }
      ).retryDelay({ maxAttempts: 2, baseDelayMs: 10 }, 1),
    ).toBe(10);
    const emptyDb = databaseWith(async () => ({ rows: [] }));
    await expect(
      new NotificationDispatchService(
        { get: () => emptyDb.database } as never,
        {} as never,
        {} as never,
        new Map() as never,
        {} as never,
      ).dispatchDue(),
    ).resolves.toEqual({ claimed: 0, outcomes: [] });
    await expect(
      new NotificationDispatchService(
        { get: () => undefined } as never,
        {} as never,
        {} as never,
        new Map() as never,
        {} as never,
      ).dispatchDue(),
    ).rejects.toThrow('Database provider is unavailable');
  });
});
