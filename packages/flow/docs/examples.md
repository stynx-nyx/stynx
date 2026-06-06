---
title: flow/examples
---

# Flow examples — end-to-end scenario

A complete walkthrough: author a 3-node approval flow, start a run, advance through tasks, read the event stream. This mirrors the UI-side scenario in [`@stynx-web/angular-flow`](/docs/packages-web/angular-flow/)'s examples.

## Scenario: expense-approval flow

Three nodes: **submitted** → **manager-review** → **approved**. The submitter fills an expense form; the manager reviews + acts.

### Step 1 — author the form

```bash
POST /flow/forms
{ "name": "Expense Request", "description": "Submit an expense for approval" }
# → { "id": "form-1", ... }

POST /flow/forms/form-1/questions
{ "prompt": "Amount", "type": "number", "required": true }

POST /flow/forms/form-1/questions
{ "prompt": "Justification", "type": "text", "required": true }
```

### Step 2 — author the graph

```bash
POST /flow/graphs
{ "name": "Expense Approval" }
# → { "id": "graph-1" }

POST /flow/graphs/graph-1/nodes
{ "key": "submitted", "label": "Submitted" }     # → node-1

POST /flow/graphs/graph-1/nodes
{ "key": "manager-review", "label": "Manager Review" }  # → node-2

POST /flow/graphs/graph-1/nodes
{ "key": "approved", "label": "Approved" }       # → node-3

POST /flow/graphs/graph-1/edges
{ "from": "node-1", "to": "node-2", "label": "submit" }

POST /flow/graphs/graph-1/edges
{ "from": "node-2", "to": "node-3", "label": "approve" }
```

### Step 3 — bind the form to the submitted node

```bash
POST /flow/nodes/node-1/form-rules
{ "formId": "form-1" }
```

### Step 4 — author a policy + publish

```bash
POST /flow/policies/sets
{ "name": "Expense Policy" }   # → policy-set-1

POST /flow/policies/sets/policy-set-1/rules
{ "action": "approve", "requiredRole": "manager" }

POST /flow/graphs/graph-1/publish
```

### Step 5 — start a run + fill the form

```bash
POST /flow/runs/ensure
{ "graphId": "graph-1", "key": "expense-2026-06-001" }
# → { "id": "run-1", "currentNode": "submitted" }

POST /flow/fills
{ "formId": "form-1", "runId": "run-1" }   # → fill-1

PUT /flow/fills/fill-1/answers
{ "answers": [
    { "questionPrompt": "Amount", "value": 1200 },
    { "questionPrompt": "Justification", "value": "Conference travel" }
  ] }
```

### Step 6 — manager acts on the task

```bash
# Manager lists their tasks
GET /flow/tasks/users/manager-1
# → [{ "id": "task-1", "node": "manager-review", "status": "assigned" }]

# Accept + act (policy checks the manager role)
POST /flow/tasks/task-1/accept
POST /flow/tasks/task-1/act
{ "action": "approve" }
# → run advances to "approved"; transition-effects fire
```

### Step 7 — read the event stream

```bash
GET /flow/runs/run-1/events
# → [
#     { "type": "run.started", ... },
#     { "type": "fill.completed", ... },
#     { "type": "task.accepted", ... },
#     { "type": "transition", "from": "manager-review", "to": "approved", ... }
#   ]
```

## Notes

- Step 5's `POST /flow/runs/ensure` is idempotent on `key` — retrying the request resumes the same run.
- Step 6's `act` goes through policy evaluation; a non-manager actor would get 403.
- The whole sequence emits audit events via `@stynx/audit` in addition to flow's own event stream.
- For the Angular implementation of this exact scenario, see [`@stynx-web/angular-flow`](/docs/packages-web/angular-flow/).
