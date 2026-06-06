---
title: flow/endpoints-policies
---

# Endpoints — policies + scopes + agent-rules + node-form-rules

AuthZ + binding: **policies** decide who can act on what; **scopes** bound visibility; **agent-rules** let automated agents act; **node-form-rules** bind forms to nodes. Backed by `FlowPolicyService` + `FlowDesignService`.

## Policies (`/flow/policies`)

| Method   | Path                                     | Description                                                              |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `GET`    | `/flow/policies/sets`                    | List policy sets.                                                        |
| `GET`    | `/flow/policies/sets/:id`                | Get a policy set with its rules.                                         |
| `POST`   | `/flow/policies/sets`                    | Create a policy set.                                                     |
| `PATCH`  | `/flow/policies/sets/:id`                | Update a policy set.                                                     |
| `DELETE` | `/flow/policies/sets/:id`                | Soft-delete a policy set.                                                |
| `GET`    | `/flow/policies/sets/:policySetId/rules` | List rules in a set.                                                     |
| `POST`   | `/flow/policies/sets/:policySetId/rules` | Add a rule.                                                              |
| `GET`    | `/flow/policies/rules/:id`               | Get a rule.                                                              |
| `PATCH`  | `/flow/policies/rules/:id`               | Update a rule.                                                           |
| `DELETE` | `/flow/policies/rules/:id`               | Soft-delete a rule.                                                      |
| `POST`   | `/flow/policies/evaluate`                | Evaluate a policy against a context — returns an authorization decision. |

The `POST /flow/policies/evaluate` endpoint is what `FlowRuntimeService` calls internally on every task action; it's also exposed for "can I do X?" pre-checks in UIs.

## Scopes (`/flow/scopes`)

| Method   | Path               | Description          |
| -------- | ------------------ | -------------------- |
| `GET`    | `/flow/scopes`     | List scopes.         |
| `GET`    | `/flow/scopes/:id` | Get a scope.         |
| `POST`   | `/flow/scopes`     | Create a scope.      |
| `PATCH`  | `/flow/scopes/:id` | Update a scope.      |
| `DELETE` | `/flow/scopes/:id` | Soft-delete a scope. |

## Agent-rules (`/flow/agent-rules`)

| Method   | Path                    | Description        |
| -------- | ----------------------- | ------------------ |
| `GET`    | `/flow/agent-rules/:id` | Get an agent-rule. |
| `PATCH`  | `/flow/agent-rules/:id` | Update.            |
| `DELETE` | `/flow/agent-rules/:id` | Soft-delete.       |

Agent-rules are _created_ per-node (`POST /flow/nodes/:nodeId/agent-rules`, see [endpoints-graph](/docs/packages/flow/endpoints-graph/)) and _managed_ here.

## Node-form-rules (`/flow/node-form-rules`)

| Method   | Path                        | Description           |
| -------- | --------------------------- | --------------------- |
| `GET`    | `/flow/node-form-rules/:id` | Get a node-form-rule. |
| `PATCH`  | `/flow/node-form-rules/:id` | Update.               |
| `DELETE` | `/flow/node-form-rules/:id` | Soft-delete.          |

Like agent-rules, these are _created_ per-node and _managed_ here.

## Notes

- **Policy evaluation is central.** Every runtime task action is gated by `POST /flow/policies/evaluate` internally. Author your policy sets before opening runs to actors.
- **Scopes** are coarse visibility boundaries; policies are fine-grained action rules. Use both.
