---
title: flow/endpoints-graph
---

# Endpoints — graphs + nodes + edges

Design-time: author the process graph. A **graph** is nodes + edges; **nodes** are states; **edges** are transitions. Graphs are versioned + publishable. Backed by `FlowDesignService`.

## Graphs (`/flow/graphs`)

| Method   | Path                                       | Description                                                      |
| -------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `GET`    | `/flow/graphs`                             | List graphs.                                                     |
| `GET`    | `/flow/graphs/:id`                         | Get a graph with its nodes + edges.                              |
| `GET`    | `/flow/graphs/:id/export`                  | Export a graph definition (JSON) — portable across environments. |
| `POST`   | `/flow/graphs`                             | Create a graph.                                                  |
| `POST`   | `/flow/graphs/import`                      | Import a graph definition (the inverse of export).               |
| `PATCH`  | `/flow/graphs/:id`                         | Update graph metadata.                                           |
| `POST`   | `/flow/graphs/:id/publish`                 | Publish a draft graph — runs can only execute published graphs.  |
| `DELETE` | `/flow/graphs/:id`                         | Soft-delete a graph.                                             |
| `GET`    | `/flow/graphs/:graphId/nodes`              | List the graph's nodes.                                          |
| `POST`   | `/flow/graphs/:graphId/nodes`              | Add a node.                                                      |
| `GET`    | `/flow/graphs/:graphId/edges`              | List the graph's edges.                                          |
| `POST`   | `/flow/graphs/:graphId/edges`              | Add an edge.                                                     |
| `GET`    | `/flow/graphs/:graphId/transition-effects` | List transition-effects across the graph.                        |
| `POST`   | `/flow/graphs/:graphId/transition-effects` | Add a transition-effect.                                         |

## Nodes (`/flow/nodes`)

| Method   | Path                              | Description                                            |
| -------- | --------------------------------- | ------------------------------------------------------ |
| `GET`    | `/flow/nodes/:id`                 | Get a node.                                            |
| `PATCH`  | `/flow/nodes/:id`                 | Update a node.                                         |
| `DELETE` | `/flow/nodes/:id`                 | Soft-delete a node.                                    |
| `GET`    | `/flow/nodes/:nodeId/agent-rules` | List the node's agent-rules.                           |
| `POST`   | `/flow/nodes/:nodeId/agent-rules` | Add an agent-rule to the node.                         |
| `GET`    | `/flow/nodes/:nodeId/form-rules`  | List the node's form-rules (forms bound to this node). |
| `POST`   | `/flow/nodes/:nodeId/form-rules`  | Bind a form to the node.                               |

## Edges (`/flow/edges`)

| Method   | Path              | Description                         |
| -------- | ----------------- | ----------------------------------- |
| `GET`    | `/flow/edges/:id` | Get an edge.                        |
| `PATCH`  | `/flow/edges/:id` | Update an edge (condition, target). |
| `DELETE` | `/flow/edges/:id` | Soft-delete an edge.                |

## Notes

- **Publish before running.** A run can only execute a _published_ graph. Draft edits don't affect in-flight runs.
- **Export/import** is the migration path between environments (dev → staging → prod). The exported JSON is self-contained.
- Agent-rules + form-rules are authored per-node here, then consumed at runtime.
