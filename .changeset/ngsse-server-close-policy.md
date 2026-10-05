---
'@stynx-nyx/angular': patch
---

Add the opt-in `StynxEventStreamConfig.serverClose` policy for a stream the
server ends without an error (UPS-NGSSE-12). `ok: 'end-of-stream'` keeps a 200
response whose body ends out of the failure window, so it never leads to polling
by itself. `cursor: 'discard'` drops `Last-Event-ID` on that 200 and emits
`resync$` with the reason `'server-close'`, which 1.5.3 reserved without
emitting. `reopen` sets the delay after a close that is not a failure (a 204,
or a 200 under `'end-of-stream'`): `'backoff'`, `'immediate'`, or
`'immediate-after-frame'`, which reopens at once only when the closed connection
delivered a frame. Every omitted field keeps the 1.5.0 behavior, and a 204 still
always discards the cursor. `FakeStynxEventStreamTransport.respond()` now
completes the connection it responded on instead of one opened by a synchronous
reopen.
