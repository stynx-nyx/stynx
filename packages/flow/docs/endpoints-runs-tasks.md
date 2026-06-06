---
title: flow/endpoints-runs-tasks
---

# Endpoints — runs + node-runs + tasks

Runtime: execute a graph and act on the work it generates. A **run** is one execution; **node-runs** are per-node execution records; **tasks** are units of work routed to actors. Backed by `FlowRuntimeService`.

## Runs (`/flow/runs`)

| Method  | Path                      | Description                                                                 |
| ------- | ------------------------- | --------------------------------------------------------------------------- |
| `GET`   | `/flow/runs`              | List runs (tenant-scoped).                                                  |
| `POST`  | `/flow/runs/ensure`       | Start or resume a run of a published graph (idempotent on the natural key). |
| `GET`   | `/flow/runs/summary`      | Summary aggregates across runs.                                             |
| `GET`   | `/flow/runs/:id`          | Get a run.                                                                  |
| `PATCH` | `/flow/runs/:id`          | Update run metadata.                                                        |
| `GET`   | `/flow/runs/:id/nodes`    | The run's node-runs.                                                        |
| `GET`   | `/flow/runs/:id/tasks`    | The run's tasks.                                                            |
| `GET`   | `/flow/runs/:id/events`   | The run's event stream.                                                     |
| `GET`   | `/flow/runs/:id/activity` | Human-readable activity timeline.                                           |
| `GET`   | `/flow/runs/:id/facts`    | Computed facts the run exposes (used by policy evaluation).                 |

## Node-runs (`/flow/node-runs`)

| Method | Path                  | Description     |
| ------ | --------------------- | --------------- |
| `GET`  | `/flow/node-runs`     | List node-runs. |
| `GET`  | `/flow/node-runs/:id` | Get a node-run. |

## Tasks (`/flow/tasks`)

| Method | Path                            | Description                                    |
| ------ | ------------------------------- | ---------------------------------------------- |
| `GET`  | `/flow/tasks`                   | List tasks (filterable by assignee, status).   |
| `GET`  | `/flow/tasks/:id`               | Get a task.                                    |
| `GET`  | `/flow/tasks/:id/candidates`    | Candidate actors who can take the task.        |
| `GET`  | `/flow/tasks/roles/:role/users` | Users in a role (for assignment UIs).          |
| `GET`  | `/flow/tasks/users/:id`         | Tasks for a specific user.                     |
| `POST` | `/flow/tasks/:id/act`           | Act on a task (the primary completion action). |
| `POST` | `/flow/tasks/:id/accept`        | Accept an assigned task.                       |
| `POST` | `/flow/tasks/:id/decline`       | Decline an assigned task.                      |
| `POST` | `/flow/tasks/:id/unaccept`      | Reverse an accept.                             |
| `POST` | `/flow/tasks/:id/withdraw`      | Withdraw from a task.                          |
| `POST` | `/flow/tasks/:id/assign`        | Assign a task to an actor.                     |
| `POST` | `/flow/tasks/:id/unassign`      | Remove an assignment.                          |

## Task lifecycle

```
created ──assign──> assigned ──accept──> accepted ──act──> completed
                       │                     │
                  (decline)            (unaccept / withdraw)
```

Every task action goes through `FlowPolicyService` — the actor must be authorized per the graph's policies. See [endpoints-policies](/docs/packages/flow/endpoints-policies/).

## Notes

- **`POST /flow/runs/ensure`** is idempotent: calling it twice with the same natural key resumes the existing run rather than creating a duplicate. This pairs with `@stynx/idempotency` for safe retries.
- **`GET /flow/runs/:id/facts`** exposes the data policy rules evaluate against — useful for debugging "why was this transition denied".
- Task actions emit audit events with the actor + before/after state.
