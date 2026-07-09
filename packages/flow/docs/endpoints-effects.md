---
title: flow/endpoints-effects
---

# Endpoints — effects + signals + events + waivers + transition-effects

Side-effects + the audit stream: **effects** are dispatched side-effects; **signals** deliver external events into a run; **events** are the read-only audit stream; **waivers** justify skipped requirements; **transition-effects** are edge-bound side-effect declarations.

## Effects (`/flow/effects`)

| Method | Path                     | Description                                                                                                                  |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/flow/effects/dispatch` | Manually dispatch an effect (the runtime usually dispatches automatically on transitions; this is for out-of-band triggers). |

## Signal (`/flow/signal`)

| Method | Path           | Description                                                                                                        |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/flow/signal` | Deliver an external signal into a run (e.g. "the payment webhook fired"). The run reacts per its graph definition. |

## Events (`/flow/events`)

| Method | Path           | Description                                                                                                                  |
| ------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/flow/events` | The read-only flow event stream (filterable by run, type, time). This is the audit-grade record of everything that happened. |

## Waivers (`/flow/waivers`)

| Method   | Path                | Description                   |
| -------- | ------------------- | ----------------------------- |
| `GET`    | `/flow/waivers`     | List waivers (tenant-scoped). |
| `POST`   | `/flow/waivers`     | Create a standalone waiver.   |
| `PATCH`  | `/flow/waivers/:id` | Update (e.g. approve).        |
| `DELETE` | `/flow/waivers/:id` | Soft-delete.                  |

Waivers are also created in the fill context (`POST /flow/fills/:fillId/waivers`, see [endpoints-fills-answers](/docs/packages/flow/endpoints-fills-answers/)); these top-level routes manage them across fills.

## Transition-effects (`/flow/transition-effects`)

| Method   | Path                           | Description              |
| -------- | ------------------------------ | ------------------------ |
| `GET`    | `/flow/transition-effects/:id` | Get a transition-effect. |
| `PATCH`  | `/flow/transition-effects/:id` | Update.                  |
| `DELETE` | `/flow/transition-effects/:id` | Soft-delete.             |

Created per-graph (`POST /flow/graphs/:graphId/transition-effects`, see [endpoints-graph](/docs/packages/flow/endpoints-graph/)); managed here.

## Notes

- **Effects vs transition-effects:** a _transition-effect_ is the design-time declaration ("when this edge fires, do X"); an _effect_ is the runtime dispatch of that. The `POST /flow/effects/dispatch` route lets you fire one manually.
- **Signals** are how external systems push events into a run — pair with `@stynx-nyx/integration-adapter` for inbound webhooks.
- **Events** are the canonical audit stream; consume them for run observability + compliance.
