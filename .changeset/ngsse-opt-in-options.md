---
'@stynx-nyx/angular': patch
---

Add opt-in `StynxEventStreamConfig` options and service members for SSE
consumers (UPS-NGSSE-11, -13, -14, -15). `reopenOnPollingEntry: 'backoff'`
schedules the reopen that enters polling on the normal retry delay instead of
immediately. `commentActivity: 'live'` lets SSE comment lines such as
`: heartbeat` return the stream to `live` and clear failure counters.
`retryAfterFrom(error, body)` adds a retry delay read from an HTTP error body;
the reopen waits for the largest of backoff, `Retry-After` and that delay.
`StynxEventStreamService` gains `resync$`, emitted once when a held cursor is
discarded by a 204 or a tenant change, and `lastError`, a signal holding the
most recent transport error. The built-in transport now sends
`Accept: text/event-stream`. Every new option defaults to the 1.5.0
behavior, and `FakeStynxEventStreamTransport.error()` accepts an optional
response body.
