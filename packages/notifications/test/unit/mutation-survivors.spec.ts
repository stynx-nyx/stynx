import { Database } from '@stynx-nyx/data';
import { CatalogService } from '@stynx-nyx/i18n';
import { PreferencesService } from '@stynx-nyx/preferences';

const aws = vi.hoisted(() => ({
  sesClients: [] as Array<Record<string, unknown>>,
  snsClients: [] as Array<Record<string, unknown>>,
}));

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: class {
    send = vi.fn();
    constructor(options: Record<string, unknown>) {
      aws.sesClients.push(options);
    }
  },
  SendEmailCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
}));

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: class {
    send = vi.fn();
    constructor(options: Record<string, unknown>) {
      aws.snsClients.push(options);
    }
  },
  PublishCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
}));

import {
  EmailSesChannelAdapter,
  InAppPostgresChannelAdapter,
  NotificationDispatchService,
  NotificationInboxService,
  NotificationsService,
  NotificationTemplateRegistry,
  NotificationTemplateRenderer,
  NotificationValidationError,
  PreferencesServicePreferencesPort,
  PushStubChannelAdapter,
  SmsSnsChannelAdapter,
  type ChannelAdapter,
} from '../../src';

const template = {
  id: 'inf.notice',
  version: 2,
  supportedChannels: ['email', 'sms', 'push', 'inapp'] as const,
  subjectKey: 'subject',
  bodyKey: 'body',
  inAppTitleKey: 'title',
  requiredVariables: ['name'],
};

const sendInput = {
  deliveryId: 'delivery-1',
  notificationId: 'notification-1',
  tenantId: 'tenant-1',
  recipient: {
    subjectId: 'subject-1',
    email: 'ada@example.test',
    phone: '+5511999999999',
    pushToken: 'push-1',
  },
  subject: 'Subject',
  body: 'Body',
  locale: 'pt-BR',
};

function databaseWith(
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>,
) {
  const trx = { query: vi.fn(query) };
  const database = {
    tx: vi.fn(async (callback: (value: typeof trx) => unknown, _options?: unknown) => callback(trx)),
  };
  return { database, trx };
}

describe('canonical notification mutation survivors', () => {
  it('binds exact SES/SNS provider requests and adapter execution context', async () => {
    aws.sesClients.length = 0;
    aws.snsClients.length = 0;
    const email = new EmailSesChannelAdapter({
      ses: {
        region: 'sa-east-1',
        endpoint: 'https://ses.example.test',
        fromAddress: 'from@example.test',
        configurationSetName: 'transactional',
      },
    });
    const sms = new SmsSnsChannelAdapter({
      sns: { region: 'sa-east-1', endpoint: 'https://sns.example.test', senderId: 'STYNX' },
    });
    expect(aws.sesClients).toEqual([{ region: 'sa-east-1', endpoint: 'https://ses.example.test' }]);
    expect(aws.snsClients).toEqual([{ region: 'sa-east-1', endpoint: 'https://sns.example.test' }]);

    const emailIntegration = (
      email as unknown as {
        integration: {
          options: Record<string, unknown>;
          execute: ReturnType<typeof vi.fn>;
        };
      }
    ).integration;
    expect(emailIntegration.options).toMatchObject({ name: 'notifications.email.ses', timeoutMs: 10_000 });
    emailIntegration.execute = vi.fn(async () => ({ status: 'SENT' }));
    await expect(email.send(sendInput)).resolves.toEqual({ status: 'SENT' });
    expect(emailIntegration.execute).toHaveBeenCalledWith(sendInput, {
      tenantId: 'tenant-1',
      correlationId: 'delivery-1',
    });

    const emailClient = (email as unknown as { client: { send: ReturnType<typeof vi.fn> } }).client;
    emailClient.send = vi.fn(async () => ({ MessageId: 'ses-message' }));
    await expect(
      (email as unknown as { sendEmail(input: typeof sendInput): Promise<unknown> }).sendEmail(
        sendInput,
      ),
    ).resolves.toEqual({ status: 'SENT', providerMessageId: 'ses-message' });
    expect(emailClient.send.mock.calls[0][0].input).toEqual({
      Source: 'from@example.test',
      Destination: { ToAddresses: ['ada@example.test'] },
      Message: {
        Subject: { Data: 'Subject', Charset: 'UTF-8' },
        Body: { Text: { Data: 'Body', Charset: 'UTF-8' } },
      },
      ConfigurationSetName: 'transactional',
    });

    const smsIntegration = (
      sms as unknown as {
        integration: { options: Record<string, unknown>; execute: ReturnType<typeof vi.fn> };
      }
    ).integration;
    expect(smsIntegration.options).toMatchObject({ name: 'notifications.sms.sns', timeoutMs: 10_000 });
    smsIntegration.execute = vi.fn(async () => ({ status: 'SENT' }));
    await sms.send(sendInput);
    expect(smsIntegration.execute).toHaveBeenCalledWith(sendInput, {
      tenantId: 'tenant-1',
      correlationId: 'delivery-1',
    });
    const smsClient = (sms as unknown as { client: { send: ReturnType<typeof vi.fn> } }).client;
    smsClient.send = vi.fn(async () => ({ MessageId: 'sns-message' }));
    await expect(
      (sms as unknown as { publish(input: typeof sendInput): Promise<unknown> }).publish(sendInput),
    ).resolves.toEqual({ status: 'SENT', providerMessageId: 'sns-message' });
    expect(smsClient.send.mock.calls[0][0].input).toEqual({
      PhoneNumber: '+5511999999999',
      Message: 'Body',
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: 'STYNX' },
      },
    });

    await expect(new EmailSesChannelAdapter({}).send(sendInput)).resolves.toEqual({
      status: 'FAILED',
      errorCode: 'SES_NOT_CONFIGURED',
      terminal: true,
    });
    await expect(new PushStubChannelAdapter().send(sendInput)).resolves.toEqual({
      status: 'SUPPRESSED',
      suppressedReason: 'push_channel_not_implemented',
      terminal: true,
    });
  });

  it('persists the exact in-app payload and requires a non-strict database lookup', async () => {
    const { database, trx } = databaseWith(async () => ({ rows: [] }));
    const get = vi.fn(() => database);
    await expect(new InAppPostgresChannelAdapter({ get } as never).send(sendInput)).resolves.toEqual({
      status: 'DELIVERED',
    });
    expect(get).toHaveBeenCalledWith(Database, { strict: false });
    expect(trx.query).toHaveBeenCalledTimes(1);
    const [sql, values] = trx.query.mock.calls[0];
    expect(sql).toContain('on conflict (delivery_id) do nothing');
    expect(values).toEqual([
      expect.any(String),
      'tenant-1',
      'subject-1',
      'notification-1',
      'delivery-1',
      'Subject',
      'Body',
      'pt-BR',
    ]);
  });

  it('queries and updates the inbox with exact tenant bounds and transaction modes', async () => {
    const item = { id: 'inbox-1' };
    const { database, trx } = databaseWith(async (sql) => ({
      rows: sql.startsWith('select') ? [item] : [],
    }));
    const get = vi.fn(() => database);
    const inbox = new NotificationInboxService({ get } as never, { tenantId: 'tenant-1' } as never);
    await expect(inbox.list({ subjectId: 'subject-1', unreadOnly: true, limit: 999 })).resolves.toEqual([
      item,
    ]);
    expect(database.tx).toHaveBeenNthCalledWith(1, expect.any(Function), { readonly: true });
    expect(trx.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('order by created_at desc limit $4'),
      ['tenant-1', 'subject-1', true, 200],
    );
    await inbox.markRead('inbox-1');
    expect(trx.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('read_at = coalesce(read_at, clock_timestamp())'),
      ['inbox-1', 'tenant-1'],
    );
    expect(get).toHaveBeenCalledWith(Database, { strict: false });
  });

  it('enqueues exact notification and delivery records with preference suppression', async () => {
    const registry = new NotificationTemplateRegistry();
    registry.register(template);
    const { database, trx } = databaseWith(async () => ({ rows: [] }));
    const read = vi.fn(async () => ({ email: false, push: true, inApp: false }));
    const service = new NotificationsService(
      { get: vi.fn(() => database) } as never,
      { tenantId: 'tenant-1', actorId: 'actor-1' } as never,
      registry,
      { read },
    );
    const result = await service.enqueue({
      recipient: {
        subjectId: 'subject-1',
        email: 'ada@example.test',
        phone: '+5511999999999',
        pushToken: 'push-1',
      },
      category: 'inf.notice',
      templateId: 'inf.notice',
      templateVersion: 2,
      locale: 'pt-BR',
      variables: { name: 'Ada' },
      channels: ['email', 'sms', 'push', 'inapp'],
      correlationId: 'correlation-1',
    });
    expect(read).toHaveBeenCalledWith('tenant-1', 'subject-1');
    expect(result.deliveries.map(({ channel, status }) => ({ channel, status }))).toEqual([
      { channel: 'email', status: 'SUPPRESSED' },
      { channel: 'sms', status: 'QUEUED' },
      { channel: 'push', status: 'QUEUED' },
      { channel: 'inapp', status: 'SUPPRESSED' },
    ]);
    const notificationValues = trx.query.mock.calls[1][1] as unknown[];
    expect(notificationValues).toEqual([
      result.notificationId,
      'tenant-1',
      'subject-1',
      'ada@example.test',
      '+5511999999999',
      'push-1',
      'inf.notice',
      'inf.notice',
      2,
      'pt-BR',
      JSON.stringify({ name: 'Ada' }),
      ['email', 'sms', 'push', 'inapp'],
      'correlation-1',
      'actor-1',
    ]);
    const deliveryValues = trx.query.mock.calls.slice(2).map((call) => call[1] as unknown[]);
    expect(deliveryValues.map((values) => values.slice(1))).toEqual([
      ['tenant-1', result.notificationId, 'email', 'SUPPRESSED', 'preference_opted_out'],
      ['tenant-1', result.notificationId, 'sms', 'QUEUED', null],
      ['tenant-1', result.notificationId, 'push', 'QUEUED', null],
      ['tenant-1', result.notificationId, 'inapp', 'SUPPRESSED', 'preference_opted_out'],
    ]);
  });

  it('returns exact correlation records through a read-only transaction', async () => {
    const { database, trx } = databaseWith(async (sql) =>
      sql.includes('select id from notifications.notifications')
        ? { rows: [{ id: 'notification-existing' }] }
        : { rows: [{ id: 'delivery-existing', channel: 'email', status: 'DELIVERED' }] },
    );
    const service = new NotificationsService(
      { get: () => database } as never,
      { tenantId: 'tenant-1' } as never,
      { resolve: () => template } as never,
      { read: vi.fn() },
    );
    await expect(
      service.enqueue({
        recipient: { subjectId: 'subject-1' },
        category: 'inf.notice',
        templateId: 'inf.notice',
        locale: 'pt-BR',
        correlationId: 'correlation-1',
      }),
    ).resolves.toEqual({
      notificationId: 'notification-existing',
      deliveries: [
        { channel: 'email', deliveryId: 'delivery-existing', status: 'DELIVERED' },
      ],
    });
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { readonly: true });
    expect(trx.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('correlation_id = $2'),
      ['tenant-1', 'correlation-1'],
    );
    expect(trx.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('order by channel'),
      ['tenant-1', 'notification-existing'],
    );
  });

  it('dispatches exact content, retry persistence, claim bounds, and PII-safe logs', async () => {
    const delivery = {
      id: 'delivery-1',
      tenant_id: 'tenant-1',
      notification_id: 'notification-1',
      channel: 'inapp',
      attempt_count: 1,
      max_attempts: 5,
      recipient_subject_id: 'subject-1',
      recipient_email: 'ada@example.test',
      recipient_phone: '+5511999999999',
      recipient_push_token: 'push-1',
      template_id: 'inf.notice',
      template_version: 2,
      locale: 'pt-BR',
      variables: { name: 'Ada' },
    };
    let selected = false;
    const { database, trx } = databaseWith(async (sql) => {
      if (sql.includes('select d.id') && !selected) {
        selected = true;
        return { rows: [delivery] };
      }
      return { rows: [] };
    });
    const send = vi.fn(async () => ({ status: 'FAILED' as const, errorCode: 'TEMPORARY' }));
    const logger = { log: vi.fn() };
    const renderer = {
      render: vi.fn(() => ({ subject: 'Subject', body: 'Body', inAppTitle: 'Inbox title' })),
    };
    const service = new NotificationDispatchService(
      { get: vi.fn(() => database) } as never,
      { resolve: vi.fn(() => template) } as never,
      renderer as never,
      new Map([['inapp', { channel: 'inapp', send } as ChannelAdapter]]),
      { retryPolicies: { inapp: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 500, jitterRatio: 0 } } },
      logger as never,
    );
    await expect(
      service.dispatchDue({ batchSize: 999, now: new Date('2026-08-26T12:00:00.000Z') }),
    ).resolves.toEqual({
      claimed: 1,
      outcomes: [{ deliveryId: 'delivery-1', channel: 'inapp', status: 'QUEUED' }],
    });
    expect(trx.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('for update of d skip locked'),
      ['2026-08-26T12:00:00.000Z', 500],
    );
    expect(trx.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("set status = 'SENT'"),
      ['delivery-1', 'tenant-1'],
    );
    expect(renderer.render).toHaveBeenCalledWith(template, 'pt-BR', { name: 'Ada' }, 'tenant-1');
    expect(send).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      notificationId: 'notification-1',
      tenantId: 'tenant-1',
      recipient: {
        subjectId: 'subject-1',
        email: 'ada@example.test',
        phone: '+5511999999999',
        pushToken: 'push-1',
      },
      subject: 'Inbox title',
      body: 'Body',
      locale: 'pt-BR',
    });
    expect(trx.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("next_attempt_at = case when $3 = 'QUEUED'"),
      ['delivery-1', 'tenant-1', 'QUEUED', null, 'TEMPORARY', null, null, 200],
    );
    expect(logger.log).toHaveBeenCalledWith('notification delivery state changed', {
      context:
        'notificationId=notification-1 deliveryId=delivery-1 channel=inapp status=QUEUED errorCode=TEMPORARY',
    });
  });

  it('retains exact registry, renderer, and preferences behaviors', async () => {
    const registry = new NotificationTemplateRegistry();
    for (const invalid of [
      { ...template, id: 'Invalid Id' },
      { ...template, version: 0 },
      { ...template, supportedChannels: [] },
    ]) {
      try {
        registry.register(invalid as never);
        expect.unreachable('invalid template must be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(NotificationValidationError);
        expect((error as NotificationValidationError).context).toMatchObject({
          templateId: invalid.id,
        });
      }
    }
    registry.register(template);
    expect(registry.resolve('inf.notice')).toBe(template);
    expect(registry.latestVersion('inf.notice')).toBe(2);

    const translate = vi.fn((key: string) => (key === 'body' ? 'Body' : `translated:${key}`));
    const getCatalog = vi.fn((token: unknown, options: unknown) =>
      token === CatalogService && (options as { strict: boolean }).strict === false
        ? { translate }
        : undefined,
    );
    const renderer = new NotificationTemplateRenderer({ get: getCatalog } as never);
    expect(renderer.render(template, 'pt-BR', { name: 'Ada' }, 'tenant-1')).toEqual({
      subject: 'translated:subject',
      body: 'Body',
      inAppTitle: 'translated:title',
    });
    expect(translate.mock.calls).toEqual([
      ['subject', 'pt-BR', { name: 'Ada' }, 'tenant-1'],
      ['body', 'pt-BR', { name: 'Ada' }, 'tenant-1'],
      ['title', 'pt-BR', { name: 'Ada' }, 'tenant-1'],
    ]);
    expect(getCatalog).toHaveBeenCalledWith(CatalogService, { strict: false });

    const getPreferences = vi.fn(async (query) => ({
      values: { notificationDelivery: { email: false, push: false, inApp: true } },
      query,
    }));
    const get = vi.fn((token: unknown, options: unknown) =>
      token === PreferencesService && (options as { strict: boolean }).strict === false
        ? { getPreferences }
        : undefined,
    );
    const port = new PreferencesServicePreferencesPort({ get } as never);
    await expect(port.read('tenant-1', 'subject-1')).resolves.toEqual({
      email: false,
      push: false,
      inApp: true,
    });
    expect(get).toHaveBeenCalledWith(PreferencesService, { strict: false });
    expect(getPreferences).toHaveBeenCalledWith({ tenantId: 'tenant-1', subjectId: 'subject-1' });
  });

  it('preserves exact validation messages, contexts, and registry selection branches', async () => {
    const registry = new NotificationTemplateRegistry();
    for (const [invalid, message, context] of [
      [{ ...template, id: '' }, 'Invalid template id', { templateId: '' }],
      [
        { ...template, version: 0 },
        'Template version must be a positive integer',
        { templateId: 'inf.notice', version: 0 },
      ],
      [
        { ...template, supportedChannels: [] },
        'Template must support at least one channel',
        { templateId: 'inf.notice' },
      ],
    ] as const) {
      try {
        registry.register(invalid as never);
        expect.unreachable('invalid template must be rejected');
      } catch (error) {
        expect(error).toMatchObject({ message, context });
      }
    }
    registry.register({ ...template, version: 1 });
    registry.register(template);
    expect(registry.resolve('inf.notice', 1).version).toBe(1);
    expect(registry.resolve('inf.notice').version).toBe(2);
    try {
      registry.register(template);
      expect.unreachable('duplicate version must be rejected');
    } catch (error) {
      expect(error).toMatchObject({
        message: 'Template version is already registered',
        context: { templateId: 'inf.notice', version: 2 },
      });
    }

    const service = new NotificationsService(
      { get: () => undefined } as never,
      { tenantId: 'tenant-1' } as never,
      registry,
      { read: vi.fn() },
    );
    try {
      await service.enqueue({} as never);
      expect.unreachable('invalid request must be rejected');
    } catch (error) {
      expect(error).toMatchObject({
        message: 'Invalid notification request',
        context: { issues: expect.arrayContaining(['recipient', 'category', 'templateId', 'locale']) },
      });
    }
  });

  it('retains template variable diagnostics and the exact title truncation boundary', () => {
    const translate = vi.fn((key: string) => (key === 'body' ? 'x'.repeat(121) : key));
    const renderer = new NotificationTemplateRenderer({
      get: () => ({ translate }),
    } as never);
    expect(
      renderer.render(
        { ...template, subjectKey: undefined, inAppTitleKey: undefined },
        'pt-BR',
        { name: 'Ada' },
      ).inAppTitle,
    ).toBe(`${'x'.repeat(119)}…`);
    expect(
      renderer.render(
        { ...template, subjectKey: undefined, inAppTitleKey: undefined, bodyKey: 'exact' },
        'pt-BR',
        { name: 'Ada' },
      ).inAppTitle,
    ).toBe('exact');
    try {
      renderer.render(template, 'pt-BR', {});
      expect.unreachable('missing template variable must be rejected');
    } catch (error) {
      expect(error).toMatchObject({
        message: 'Missing required template variables',
        context: { templateId: 'inf.notice', missing: ['name'] },
      });
    }
  });

  it('keeps inbox default filters and dispatch retry arithmetic exact', async () => {
    const { database, trx } = databaseWith(async () => ({ rows: [] }));
    const inbox = new NotificationInboxService(
      { get: () => database } as never,
      { tenantId: 'tenant-1' } as never,
    );
    await inbox.list({ subjectId: 'subject-1' });
    expect(trx.query).toHaveBeenCalledWith(expect.any(String), [
      'tenant-1',
      'subject-1',
      false,
      50,
    ]);

    const dispatch = new NotificationDispatchService(
      { get: () => database } as never,
      {} as never,
      {} as never,
      new Map(),
      {},
    ) as unknown as {
      retryDelay(
        policy: { maxAttempts: number; baseDelayMs: number; maxDelayMs?: number; jitterRatio?: number },
        attempt: number,
      ): number;
    };
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(dispatch.retryDelay({ maxAttempts: 5, baseDelayMs: 100 }, 1)).toBe(100);
    expect(dispatch.retryDelay({ maxAttempts: 5, baseDelayMs: 100 }, 3)).toBe(400);
    expect(
      dispatch.retryDelay(
        { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 250, jitterRatio: 0.2 },
        4,
      ),
    ).toBe(225);
    expect(random).toHaveBeenCalledWith();
  });

  it('distinguishes missing adapters and channel-specific subject projection', async () => {
    const rows = [
      {
        id: 'delivery-email',
        tenant_id: 'tenant-1',
        notification_id: 'notification-1',
        channel: 'email',
        attempt_count: 0,
        max_attempts: 5,
        recipient_subject_id: 'subject-1',
        recipient_email: 'ada@example.test',
        recipient_phone: null,
        recipient_push_token: null,
        template_id: 'inf.notice',
        template_version: 2,
        locale: 'pt-BR',
        variables: { name: 'Ada' },
      },
      {
        id: 'delivery-sms',
        tenant_id: 'tenant-1',
        notification_id: 'notification-1',
        channel: 'sms',
        attempt_count: 0,
        max_attempts: 5,
        recipient_subject_id: 'subject-1',
        recipient_email: null,
        recipient_phone: '+5511999999999',
        recipient_push_token: null,
        template_id: 'inf.notice',
        template_version: 2,
        locale: 'pt-BR',
        variables: { name: 'Ada' },
      },
    ];
    let selected = false;
    const { database } = databaseWith(async (sql) => {
      if (sql.includes('select d.id') && !selected) {
        selected = true;
        return { rows };
      }
      return { rows: [] };
    });
    const emailSend = vi.fn(async () => ({ status: 'SENT' as const }));
    const logger = { log: vi.fn() };
    const service = new NotificationDispatchService(
      { get: () => database } as never,
      { resolve: () => template } as never,
      { render: () => ({ subject: 'Subject', body: 'Body', inAppTitle: 'Inbox title' }) } as never,
      new Map([['email', { channel: 'email', send: emailSend } as ChannelAdapter]]),
      {},
      logger as never,
    );
    await expect(service.dispatchDue()).resolves.toEqual({
      claimed: 2,
      outcomes: [
        { deliveryId: 'delivery-email', channel: 'email', status: 'SENT' },
        { deliveryId: 'delivery-sms', channel: 'sms', status: 'FAILED' },
      ],
    });
    expect(emailSend).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Subject' }));
    expect(logger.log).toHaveBeenLastCalledWith('notification delivery state changed', {
      context:
        'notificationId=notification-1 deliveryId=delivery-sms channel=sms status=FAILED errorCode=CHANNEL_ADAPTER_UNAVAILABLE',
    });
  });
});
