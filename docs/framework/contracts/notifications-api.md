# Notifications API contract

`@stynx-nyx/notifications` provides tenant-scoped, preference-aware delivery across
email (SES), SMS (SNS), push (currently a deliberate stub), and an in-app Postgres inbox.

## Enqueue and templates

Consumers call `NotificationsService.enqueue()` with a recipient, category, registered
template id/version, locale, variables, optional channels, and optional tenant-scoped
`correlationId`. Repeating a correlation id returns the existing notification and does
not create duplicate deliveries. Templates are immutable, **code-registered** objects;
their version, supported channels and ICU catalog keys are reviewed and deployed with
the calling code. This was chosen over DB-authored templates because no template admin
authority or publication workflow exists yet. Catalog strings live in the package's
`i18n/pt-BR.json` and `i18n/en-US.json` files and are rendered by `@stynx-nyx/i18n`.

The stored template version makes historical delivery auditable even after a later
template version is registered. Callers must register every template during bootstrap.

## Delivery and state

Enqueue creates one delivery per requested/supported channel. The state machine is
`QUEUED -> SENT -> DELIVERED | FAILED | SUPPRESSED`; a retryable send error moves a
claimed delivery back to `QUEUED` with exponential, jittered backoff. `FAILED` is only
written for exhausted or terminal failures. In-app writes an inbox row and is immediately
`DELIVERED`; provider adapters normally return `SENT` until a future provider webhook
confirms delivery.

`NotificationDispatchPort.dispatchDue()` is the only worker-facing port. It has no
dependency on `@stynx-nyx/jobs`; the future jobs integration must establish an app tenant
context and invoke this port separately for each tenant, preserving forced RLS. Claims use
`FOR UPDATE SKIP LOCKED`, so concurrent workers do not double-send.

## Preferences, privacy and logging

The package consumes `NotificationDeliveryPreferences` from `@stynx-nyx/preferences`:
`email`, `push`, and `inApp` false values create terminal `SUPPRESSED` rows. The current
preference contract has no SMS property, so SMS is selected explicitly by the caller;
that limitation is intentional and must not be papered over with a duplicate contract.

Recipient contact details, raw template variables, rendered content and provider error
detail are PII and are stored only in the RLS-protected delivery data. Log events contain
only notification/delivery ids, channel, state, and error code, allowing the logging
package's configured redaction policy to remain the outer guard.

## Adopter wiring

Import `StynxNotificationsModule.forRoot()` after the app root has imported data, core,
i18n, logging, and preferences. Supply SES/SNS configuration only for channels enabled
in that deployment. Push is a suppression stub until mobile/device-token/provider work;
jobs integration is also deferred.
