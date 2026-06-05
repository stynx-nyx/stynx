---
title: stynx HTTP error envelope
sidebar_position: 1
---

# `error-envelope.schema.json`

**Title:** stynx HTTP error envelope
**`$id`:** `https://stynx.dev/schemas/error-envelope.schema.json`

Stable shape of error responses produced by @stynx/core's StynxErrorFilter. Every stynx HTTP endpoint emits this envelope on 4xx + 5xx responses. Source-of-truth for the canonical error-response shape referenced by INV-ERROR-001 and the baseline errors catalogue at docs/framework/contracts/errors.json.

## Top-level properties

| Property     | Type      | Description                                                                                                                                                                                 |
| ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `statusCode` | `integer` | HTTP status code (4xx for client errors, 5xx for server errors).                                                                                                                            |
| `errorCode`  | `string`  | Stable machine-readable error identifier in the shape <DOMAIN>:<CATEGORY>:<DETAIL>. Examples: AUTH:UNAUTHENTICATED:missing-token, RESOURCE:NOT_FOUND:by-id, RATELIMIT:THROTTLED:per-tenant. |
| `message`    | `string`  | Human-readable explanation safe to log and display to end users. Never contains stack traces or internal implementation details.                                                            |
| `requestId`  | `string`  | Echoed request-correlation id from the X-Request-Id header, or a server-generated id when the request did not carry one. Used to cross-reference audit log entries.                         |
| `details`    | `object`  | Optional per-error metadata; shape depends on errorCode. Adopter-specific shapes are documented under per-module errors.json files (e.g. domain/<module>/api/docs/errors.json).             |
| `retryable`  | `boolean` | Hint to the client whether the request may be retried with the same input (true for 429/5xx-with-Retry-After, false for 4xx semantic errors).                                               |

## Source

<details>
<summary>Click to expand the full JSON</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://stynx.dev/schemas/error-envelope.schema.json",
  "title": "stynx HTTP error envelope",
  "description": "Stable shape of error responses produced by @stynx/core's StynxErrorFilter. Every stynx HTTP endpoint emits this envelope on 4xx + 5xx responses. Source-of-truth for the canonical error-response shape referenced by INV-ERROR-001 and the baseline errors catalogue at docs/framework/contracts/errors.json.",
  "type": "object",
  "required": ["statusCode", "errorCode", "message", "requestId"],
  "additionalProperties": false,
  "properties": {
    "statusCode": {
      "type": "integer",
      "minimum": 400,
      "maximum": 599,
      "description": "HTTP status code (4xx for client errors, 5xx for server errors)."
    },
    "errorCode": {
      "type": "string",
      "pattern": "^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*:[a-zA-Z][a-zA-Z0-9_*-]*$",
      "description": "Stable machine-readable error identifier in the shape <DOMAIN>:<CATEGORY>:<DETAIL>. Examples: AUTH:UNAUTHENTICATED:missing-token, RESOURCE:NOT_FOUND:by-id, RATELIMIT:THROTTLED:per-tenant."
    },
    "message": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable explanation safe to log and display to end users. Never contains stack traces or internal implementation details."
    },
    "requestId": {
      "type": "string",
      "minLength": 1,
      "description": "Echoed request-correlation id from the X-Request-Id header, or a server-generated id when the request did not carry one. Used to cross-reference audit log entries."
    },
    "details": {
      "type": "object",
      "description": "Optional per-error metadata; shape depends on errorCode. Adopter-specific shapes are documented under per-module errors.json files (e.g. domain/<module>/api/docs/errors.json).",
      "additionalProperties": true
    },
    "retryable": {
      "type": "boolean",
      "description": "Hint to the client whether the request may be retried with the same input (true for 429/5xx-with-Retry-After, false for 4xx semantic errors)."
    }
  },
  "examples": [
    {
      "statusCode": 404,
      "errorCode": "RESOURCE:NOT_FOUND:by-id",
      "message": "Bookmark not found in this tenant.",
      "requestId": "req_01HX5K3J7M",
      "retryable": false
    },
    {
      "statusCode": 429,
      "errorCode": "RATELIMIT:THROTTLED:per-tenant",
      "message": "Tenant quota exceeded; retry after 30 seconds.",
      "requestId": "req_01HX5K4Q2R",
      "details": { "limit": 1000, "window_seconds": 60, "retry_after_seconds": 30 },
      "retryable": true
    }
  ]
}
```

</details>

## See also

- [Schema browser](index.md) — full catalog of schemas.
- [Invariants](../invariants.md) — how schemas back the invariant contract.
