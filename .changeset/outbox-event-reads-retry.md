---
'@stynx-nyx/outbox': patch
---

Add tenant-scoped event-mode read ports and an operator retry to
`OutboxService`, all running as `stynx_app` with an actor-bearing request
context and FORCE RLS (never owner): `listEvents()` (delivery status and
`entity` equality/prefix filters, `createdAt desc, id desc` keyset pages),
`getEventDelivery()`, `getAggregateDelivery()`, `listEventAttempts()` (raw
bytes only with `includeBytes`) and `getQueueHealth()`. `retryEvent()` makes
an `ERROR` delivery `PENDING` and eligible now or at the earlier of its
current eligibility and the backoff time,
preserving attempts, `last_error` and the attempt/ACK ledgers; any other state
raises the new `OutboxEventNotFailedError`, and a missing or foreign event
raises `OutboxNotFoundError`. Existing methods are unchanged.
