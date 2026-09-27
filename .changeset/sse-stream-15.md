---
'@stynx-nyx/angular': minor
'@stynx-nyx/backend': minor
---

Add a scoped NestJS SSE stream service with explicit per-tick request context,
cursor replay, bounded connection and payload handling, and observability.
Add an Angular SSE client using the normal HTTP interceptors, controlled
reconnection and polling, session and tenant lifecycle, and public test
doubles. The fixed STYNX package group advances together.

Consumers supply an RLS-scoped event source and a session-active Signal;
configure `StynxEventStreamModule.forRoot({ contextRunner: database })` on
the server and `provideStynxEventStream(...)` in Angular. The real public
symbols and full wiring are documented in the package README and
`docs/framework/contracts/sse-1.5.md`.
