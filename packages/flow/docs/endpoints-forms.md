---
title: flow/endpoints-forms
---

# Endpoints — forms + questions

Design-time: author forms (questionnaire templates) and their questions. All routes require a bearer token + the relevant flow permission; all mutations emit audit events.

## Forms (`/flow/forms`)

| Method   | Path                                        | Description                            |
| -------- | ------------------------------------------- | -------------------------------------- |
| `GET`    | `/flow/forms`                               | List forms (paginated, tenant-scoped). |
| `GET`    | `/flow/forms/:id`                           | Get a form with its questions.         |
| `POST`   | `/flow/forms`                               | Create a form.                         |
| `PATCH`  | `/flow/forms/:id`                           | Update a form's metadata.              |
| `DELETE` | `/flow/forms/:id`                           | Soft-delete a form.                    |
| `GET`    | `/flow/forms/:formId/questions`             | List a form's questions.               |
| `POST`   | `/flow/forms/:formId/questions`             | Add a question to a form.              |
| `GET`    | `/flow/forms/:formId/fills`                 | List fills (submissions) of a form.    |
| `GET`    | `/flow/forms/:formId/fills/:fillId`         | Get a specific fill.                   |
| `GET`    | `/flow/forms/:formId/fills/:fillId/answers` | Answers within a fill.                 |
| `GET`    | `/flow/forms/:formId/fills/:fillId/waivers` | Waivers within a fill.                 |
| `POST`   | `/flow/forms/:formId/fills`                 | Start a new fill of the form.          |
| `POST`   | `/flow/forms/:formId/fills/:fillId/waivers` | Add a waiver to a fill.                |

The form-centric fill routes here mirror the fill-centric routes in [endpoints-fills-answers](/docs/packages/flow/endpoints-fills-answers/) — use whichever entry point fits your call site.

## Questions (`/flow/questions`)

| Method   | Path                        | Description                        |
| -------- | --------------------------- | ---------------------------------- |
| `GET`    | `/flow/questions/:id`       | Get a question.                    |
| `PATCH`  | `/flow/questions/:id`       | Update a question.                 |
| `DELETE` | `/flow/questions/:id`       | Soft-delete a question.            |
| `GET`    | `/flow/questions/:id/score` | Get the question's scoring config. |
| `PUT`    | `/flow/questions/:id/score` | Set/replace the scoring config.    |
| `DELETE` | `/flow/questions/:id/score` | Remove scoring.                    |

## Notes

- Forms are versioned implicitly through their question set; changing a question after fills exist does NOT retroactively rescore — handle migrations explicitly.
- Scoring is optional; a question without a score config is informational.
- Backed by `FlowDesignService` (CRUD) + `FlowFormsService` (fill-related reads).
