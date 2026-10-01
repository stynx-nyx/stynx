---
'@stynx-nyx/angular': patch
---

Honor `Retry-After` when a 429 is the failure that moves
`StynxEventStreamService` into polling. The client previously reopened the
stream immediately on entering polling and skipped the `Retry-After` delay; it
now waits `max(backoff, Retry-After)` as the SSE contract requires. Entering
polling without `Retry-After` still reopens immediately.
