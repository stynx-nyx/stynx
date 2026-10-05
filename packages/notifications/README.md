# `@stynx-nyx/notifications` — multi-channel notification delivery with templates, preference-aware suppression and retryable delivery tracking

`@stynx-nyx/notifications` records tenant-scoped notifications and delivers them over email (Amazon SES), SMS (Amazon SNS), push (currently a deliberate stub) and an in-app Postgres inbox. Enqueueing writes a notification and one delivery row per channel; a separate dispatch step claims due deliveries, renders the template through the i18n catalog, calls the channel adapter and records the outcome with retry and backoff.

## Purpose

Sending a notification directly from a request handler couples the request to a provider call, loses the message when the provider is down, and makes it hard to honour a recipient's channel preferences. This package separates the two halves:

- `NotificationsService.enqueue()` validates the request, resolves a code-registered template, reads the recipient's delivery preferences, and writes the notification with one `QUEUED` or `SUPPRESSED` delivery per channel in a single transaction. It never calls a provider.
- `NotificationDispatchService.dispatchDue()` claims queued deliveries with `FOR UPDATE SKIP LOCKED`, sends each through its `ChannelAdapter`, and persists the result. A retryable failure returns the delivery to `QUEUED` with exponential, jittered backoff.

What it does not do: it does not resolve identity (the caller supplies the recipient's email, phone or push token), it does not schedule its own dispatch loop (the host calls `dispatchDue()`), it has no database-backed template store, it does not mount an HTTP controller, and it does not deliver push notifications yet.

## Audience

Backend developers who need to notify users from a STYNX application, and developers writing a channel adapter or a preferences port for a deployment that does not use the bundled ones.

## Install

```bash
pnpm add @stynx-nyx/notifications
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

**Node:** 24.x.

The notification tables are created by the platform migration `packages/data/migrations/platform/0018_notifications.sql`; apply it before using the module.

## Quick start

Import the module after the application root has registered the data, core, i18n, logging and preferences modules. Supply `ses` and `sns` only for the channels enabled in the deployment.

```ts
import { Module } from '@nestjs/common';
import { StynxNotificationsModule } from '@stynx-nyx/notifications';

@Module({
  imports: [
    StynxNotificationsModule.forRoot({
      ses: { region: 'sa-east-1', fromAddress: 'no-reply@example.com' },
    }),
  ],
})
export class AppModule {}
```

Register a template during bootstrap, then enqueue from request-scoped code. A tenant must be present in the request context.

```ts
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { NotificationTemplateRegistry, NotificationsService } from '@stynx-nyx/notifications';

@Injectable()
export class NoticeNotifications implements OnModuleInit {
  constructor(
    private readonly templates: NotificationTemplateRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.templates.register({
      id: 'inf.notice',
      version: 1,
      supportedChannels: ['email', 'inapp'],
      subjectKey: 'notifications.example.subject',
      bodyKey: 'notifications.example.body',
      requiredVariables: ['name'],
    });
  }

  send(subjectId: string, email: string) {
    return this.notifications.enqueue({
      recipient: { subjectId, email },
      category: 'inf.notice',
      templateId: 'inf.notice',
      locale: 'pt-BR',
      variables: { name: 'Ana' },
      correlationId: `notice:${subjectId}`,
    });
  }
}
```

## Public API surface

### Modules

| Export                     | Signature                                             | Description                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `StynxNotificationsModule` | `.forRoot(options?: StynxNotificationsModuleOptions)` | Global module. Exports `NotificationsService`, `NotificationDispatchService`, `NotificationInboxService`, `NotificationTemplateRegistry` and `STYNX_NOTIFICATIONS_PREFERENCES_PORT`. |

### Services

| Export                              | Description                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotificationsService`              | `enqueue(request: NotifyRequest): Promise<NotifyResult>` records a notification and its deliveries.                                             |
| `NotificationDispatchService`       | Implements `NotificationDispatchPort`. `dispatchDue(options?: DispatchDueOptions): Promise<DispatchDueResult>` claims and sends due deliveries. |
| `NotificationInboxService`          | `list(query: InboxQuery): Promise<InboxItem[]>` returns a subject's in-app items, newest first; `markRead(id)` sets the read timestamp once.    |
| `NotificationTemplateRegistry`      | In-process template store implementing `TemplateRegistry`: `register(template)`, `resolve(templateId, version?)`, `latestVersion(templateId)`.  |
| `NotificationTemplateRenderer`      | `render(template, locale, variables, tenantId?): RenderedContent` translates the template keys through `CatalogService` from `@stynx-nyx/i18n`. |
| `PreferencesServicePreferencesPort` | Default `NotificationPreferencesPort`; reads `notificationDelivery` from `PreferencesService` in `@stynx-nyx/preferences`.                      |

### Channel adapters

| Export                        | Channel | Behaviour                                                                                                                                  |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `EmailSesChannelAdapter`      | `email` | Sends a plain-text email through SES and returns `SENT`. Returns terminal `FAILED` with `SES_NOT_CONFIGURED` when no `fromAddress` is set. |
| `SmsSnsChannelAdapter`        | `sms`   | Publishes the body to the recipient's phone number through SNS and returns `SENT`.                                                         |
| `PushStubChannelAdapter`      | `push`  | Always returns terminal `SUPPRESSED` with reason `push_channel_not_implemented`.                                                           |
| `InAppPostgresChannelAdapter` | `inapp` | Inserts one inbox item per delivery and returns `DELIVERED`.                                                                               |

The SES and SNS adapters wrap the provider call with the circuit breaker and a 10-second timeout from `@stynx-nyx/integration-adapter`, making one attempt per call; retries belong to the dispatch loop. A provider error is returned as `FAILED` with `SES_SEND_FAILED` or `SNS_PUBLISH_FAILED`.

### Schemas

| Export                        | Description                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `notifyRequestSchema`         | Strict zod schema applied by `enqueue()`. Unknown fields are rejected; `category` must be dotted lower case; `locale` is 2 to 35 characters. |
| `notificationRecipientSchema` | Strict zod schema for the recipient: required `subjectId`, optional `email`, optional E.164 `phone`, optional `pushToken`.                   |
| `NotifyRequestInput`          | Type inferred from `notifyRequestSchema`.                                                                                                    |

### Constants and tokens

| Export                                  | Description                                                   |
| --------------------------------------- | ------------------------------------------------------------- |
| `NOTIFICATION_CHANNELS`                 | `['email', 'sms', 'push', 'inapp']`.                          |
| `TERMINAL_DELIVERY_STATUSES`            | `['DELIVERED', 'FAILED', 'SUPPRESSED']`.                      |
| `STYNX_NOTIFICATIONS_OPTIONS`           | Injection token for the options passed to `forRoot()`.        |
| `STYNX_NOTIFICATIONS_PREFERENCES_PORT`  | Injection token for the active `NotificationPreferencesPort`. |
| `STYNX_NOTIFICATIONS_TEMPLATE_REGISTRY` | Injection token aliasing `NotificationTemplateRegistry`.      |
| `STYNX_NOTIFICATIONS_CHANNEL_ADAPTERS`  | Injection token for the map of channel to `ChannelAdapter`.   |

### Errors

All four extend `StynxError` from `@stynx-nyx/core`.

| Export                                | Code                                 | Status | Raised when                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotificationValidationError`         | `NOTIFICATIONS_VALIDATION_ERROR`     | 400    | The request fails the schema, no tenant is in context, a requested channel is not supported by the template, a template registration is invalid or duplicated, or a required variable is missing at render time. |
| `NotificationTemplateNotFoundError`   | `NOTIFICATIONS_TEMPLATE_NOT_FOUND`   | 404    | The template id or the requested version is not registered.                                                                                                                                                      |
| `NotificationNoRecipientAddressError` | `NOTIFICATIONS_NO_RECIPIENT_ADDRESS` | 400    | The SES or SNS adapter is asked to send to a recipient without an email or phone.                                                                                                                                |
| `NotificationDeliveryNotFoundError`   | `NOTIFICATIONS_DELIVERY_NOT_FOUND`   | 404    | Exported for consumers; no service in this package throws it.                                                                                                                                                    |

### Types

| Export                                                                                                        | Description                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NotifyRequest`, `NotifyResult`, `NotificationRecipient`                                                      | Input and result of `enqueue()`.                                                                                |
| `NotificationChannel`                                                                                         | `'email' \| 'sms' \| 'push' \| 'inapp'`.                                                                        |
| `DeliveryStatus`                                                                                              | `'QUEUED' \| 'SENT' \| 'DELIVERED' \| 'FAILED' \| 'SUPPRESSED'`.                                                |
| `DeliveryRecord`, `DispatchClaim`                                                                             | Shapes of a delivery row and of a claimed delivery joined with its notification.                                |
| `DispatchDueOptions`, `DispatchDueResult`, `DispatchOutcome`                                                  | Input and result of `dispatchDue()`.                                                                            |
| `NotificationDispatchPort`                                                                                    | The worker-facing port: `dispatchDue(options?)`.                                                                |
| `InboxItem`, `InboxQuery`                                                                                     | In-app inbox row and query.                                                                                     |
| `NotificationTemplate`, `RenderedContent`, `TemplateRegistry`                                                 | Template definition, rendered output, and the registry interface.                                               |
| `ChannelAdapter`, `ChannelSendInput`, `ChannelSendResult`, `ChannelAdapterRecipient`, `ChannelAdapterChannel` | The channel send port and its input and result shapes.                                                          |
| `NotificationPreferencesPort`                                                                                 | `read(tenantId, subjectId)` returning the `NotificationDeliveryPreferences` type from `@stynx-nyx/preferences`. |
| `ChannelRetryPolicy`, `StynxNotificationsModuleOptions`                                                       | Configuration types; see [Configuration](#configuration).                                                       |

## Configuration

### `StynxNotificationsModule.forRoot()` options

| Option                     | Type                                                       | Default                             | Description                                                                             |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| `ses.region`               | `string`                                                   | none                                | SES region. The `email` channel has an adapter only when `ses` is set.                  |
| `ses.fromAddress`          | `string`                                                   | none                                | Sender address.                                                                         |
| `ses.configurationSetName` | `string`                                                   | none                                | Optional SES configuration set.                                                         |
| `ses.endpoint`             | `string`                                                   | none                                | Optional endpoint override for the SES client.                                          |
| `sns.region`               | `string`                                                   | none                                | SNS region. The `sms` channel has an adapter only when `sns` is set.                    |
| `sns.senderId`             | `string`                                                   | none                                | Optional SMS sender id.                                                                 |
| `sns.endpoint`             | `string`                                                   | none                                | Optional endpoint override for the SNS client.                                          |
| `retryPolicies`            | `Partial<Record<NotificationChannel, ChannelRetryPolicy>>` | see below                           | Per-channel retry policy.                                                               |
| `preferencesPort`          | `NotificationPreferencesPort`                              | `PreferencesServicePreferencesPort` | Replaces the port that reads channel opt-in state.                                      |
| `channelAdapters`          | `Partial<Record<NotificationChannel, ChannelAdapter>>`     | none                                | Adds or overrides the adapter of a channel. Mainly for tests.                           |
| `mountController`          | `boolean`                                                  | none                                | Declared on the options type but not read by the module; the package has no controller. |

A channel without a `retryPolicies` entry uses `maxAttempts` 5, `baseDelayMs` 30 000, `maxDelayMs` 3 600 000 and `jitterRatio` 0.2. The delay before a retry is `baseDelayMs` after the first failed attempt and doubles with each further attempt, capped at `maxDelayMs`, then varied by plus or minus `jitterRatio`. A delivery stops retrying once its attempt count reaches `maxAttempts`.

### `dispatchDue()` options

| Option      | Type     | Default      | Description                                                 |
| ----------- | -------- | ------------ | ----------------------------------------------------------- |
| `batchSize` | `number` | `50`         | Deliveries claimed per call; clamped to between 1 and 500.  |
| `now`       | `Date`   | current time | Deliveries whose next attempt is at or before this are due. |

The package reads no environment variables. The AWS SDK clients resolve credentials through their own default provider chain.

## Examples

### Example 1 — run the dispatch step

The package does not poll. Call `dispatchDue()` from a host-owned poller or job handler that runs under a tenant context.

```ts
import { Injectable } from '@nestjs/common';
import { NotificationDispatchService } from '@stynx-nyx/notifications';

@Injectable()
export class NotificationPump {
  constructor(private readonly dispatch: NotificationDispatchService) {}

  async run(): Promise<number> {
    const result = await this.dispatch.dispatchDue({ batchSize: 100 });
    return result.claimed;
  }
}
```

### Example 2 — restrict channels and pin a template version

```ts
const result = await notifications.enqueue({
  recipient: { subjectId, phone: '+5511999999999' },
  category: 'inf.notice',
  templateId: 'inf.notice',
  templateVersion: 1,
  locale: 'pt-BR',
  channels: ['sms'],
});
// result.deliveries: [{ channel: 'sms', deliveryId, status: 'QUEUED' }]
```

`channels` defaults to every channel the template supports. Requesting a channel the template does not list throws `NotificationValidationError`.

### Example 3 — read the in-app inbox

```ts
const unread = await inbox.list({ subjectId, unreadOnly: true, limit: 20 });
await inbox.markRead(unread[0].id);
```

`limit` defaults to 50 and is clamped to between 1 and 200.

### Example 4 — replace the preferences port

```ts
StynxNotificationsModule.forRoot({
  preferencesPort: {
    read: async () => ({ email: true, push: false, inApp: true }),
  },
});
```

## Common pitfalls

- **Nothing is sent until `dispatchDue()` runs.** `enqueue()` only writes rows.
- **Templates must be registered in every process that enqueues or dispatches.** The registry is in memory; dispatch resolves the stored template id and version again, so the attempt fails in a process where the template is not registered.
- **A template version is immutable.** Registering the same id and version twice throws; publish a change as a new version. `resolve()` without a version returns the highest registered one.
- **`requiredVariables` are checked at render time, not by `enqueue()`.** A missing variable surfaces during dispatch as a `FAILED` attempt with error code `CHANNEL_SEND_EXCEPTION`, which is retried until the policy is exhausted. The same applies to a recipient with no email or phone for the channel.
- **A channel without an adapter fails terminally.** If `ses` or `sns` is not configured and a delivery for that channel is claimed, it becomes `FAILED` with `CHANNEL_ADAPTER_UNAVAILABLE` and is not retried.
- **SMS is not preference-gated.** The preferences contract has `email`, `push` and `inApp` flags only. A `false` flag produces a `SUPPRESSED` delivery with reason `preference_opted_out`; SMS is controlled only by the caller's `channels` selection.
- **`correlationId` is the idempotency key.** A repeated `enqueue()` with the same tenant and `correlationId` returns the existing notification and its current delivery statuses without creating rows.
- **Provider channels stop at `SENT`.** Only the in-app adapter reports `DELIVERED`; there is no provider webhook handling in this package.
- **`StynxI18nModule.forRoot()` must be imported at the application root.** The renderer looks up `CatalogService` lazily and throws when it is absent.
- **Do not log recipients, variables or rendered content.** The dispatch service logs only notification id, delivery id, channel, status and error code.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — `RequestContext` (tenant and actor) and the `StynxError` base class.
- [`@stynx-nyx/data`](/docs/packages/data/) — `Database` transactions and the platform migration that creates the notification tables.
- [`@stynx-nyx/i18n`](/docs/packages/i18n/) — `CatalogService` renders template subject, body and in-app title keys.
- [`@stynx-nyx/preferences`](/docs/packages/preferences/) — owns `NotificationDeliveryPreferences` and the default source of opt-in state.
- [`@stynx-nyx/integration-adapter`](/docs/packages/integration-adapter/) — circuit breaker and timeout around the SES and SNS calls.
- [`@stynx-nyx/logging`](/docs/packages/logging/) — optional `StynxLogger` used for delivery state logs.
- [`@stynx-nyx/jobs`](/docs/packages/jobs/) — not a dependency; a job handler is one way for a host to invoke `NotificationDispatchPort`.

Contract and decision: `docs/framework/contracts/notifications-api.md` and `law/adr/ADR-NOTIFICATIONS-0001-delivery-capability.md`.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@aws-sdk/client-ses`: `^3.1037.0`
- `@aws-sdk/client-sns`: `^3.1037.0`
- `@stynx-nyx/contracts`: `workspace:*`
- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `@stynx-nyx/i18n`: `workspace:*`
- `@stynx-nyx/integration-adapter`: `workspace:*`
- `@stynx-nyx/logging`: `workspace:*`
- `@stynx-nyx/preferences`: `workspace:*`
- `zod`: `^4.3.6`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@nestjs/platform-express`: `^11.1.26`
- `@nestjs/testing`: `^11.1.26`
- `@types/node`: `24.13.4`
- `testcontainers`: `^12.0.2`
- `ts-node`: `^10.9.2`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
