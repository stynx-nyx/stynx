---
adr_id: ADR-NOTIFICATIONS-0001
title: Notification delivery capability
status: accepted
date: 2026-08-24
authors: ['Architect']
tags: [stynx, notifications, tenancy, delivery]
---

# ADR-NOTIFICATIONS-0001 — Notification delivery capability

## Decision

Add `@stynx-nyx/notifications` as the delivery capability. It consumes the existing
`NotificationDeliveryPreferences` contract; it does not define a second preferences
model. SES and SNS SDK imports are isolated to their channel adapters. Push is a port
with a terminal suppression stub until the mobile phase selects a provider. In-app uses a
tenant-RLS Postgres inbox.

Templates are code-registered, immutable and versioned. Their locale strings use the
shared i18n catalog mechanism. The package owns durable delivery state and retry
calculation, but exports only a narrow `NotificationDispatchPort`; jobs may schedule that
port later without creating a dependency cycle.

## Consequences

All delivery records and inbox rows are forced-RLS tenant tables. A dispatcher must run
per tenant under app context. Recipient details and rendered content are PII and never
enter application logs. Provider delivery callbacks and a real push adapter remain
follow-up work.
