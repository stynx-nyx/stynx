---
'@stynx-nyx/angular': patch
---

Add the opt-in `StynxEventStreamConfig.openStatus` option (UPS-NGSSE-13, item 3
of #321). With `'first-line'`, opening a connection no longer sets the status at
once: the status it would have set (`live`, `reconnecting` or `polling`) is held
for that connection and applied by its first received line, before any frame or
comment handling, so a frame or a live comment on that line still wins. The
first `start()`, and a `start()` after `stop()`, wait in `idle`; a tenant change
and an immediate end-of-stream reopen keep the previous status; a planned age or
byte reopen keeps `live`. The silence timer still runs from the open, so a
reopen that receives nothing counts a failure after `heartbeatMs × staleFactor`.
Lines from a connection a subscriber already stopped or replaced are ignored.
`'immediate'`, the default, keeps the 1.5.0 behavior, and any other value is
rejected by `provideStynxEventStream`.
