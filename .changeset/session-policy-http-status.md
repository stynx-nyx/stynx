---
'@stynx-nyx/sessions': patch
---

Return HTTP 409 for `SessionConflictError` and HTTP 403 for
`StrongFactorRequiredError` from the session endpoints. Both errors now extend
`StynxError`, so `StynxErrorFilter` renders `{ code, message }` instead of
rethrowing them as HTTP 500. The `code` values are unchanged.
