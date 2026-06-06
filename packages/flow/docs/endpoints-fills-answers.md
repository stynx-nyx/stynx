---
title: flow/endpoints-fills-answers
---

# Endpoints — fills + answers

Runtime: capture form submissions. A **fill** is one submission of a form; **answers** are the responses to its questions; **waivers** justify skipped requirements. Backed by `FlowFormsService`.

## Fills (`/flow/fills`)

| Method   | Path                          | Description                         |
| -------- | ----------------------------- | ----------------------------------- |
| `GET`    | `/flow/fills`                 | List fills (tenant-scoped).         |
| `GET`    | `/flow/fills/:id`             | Get a fill with its answers.        |
| `POST`   | `/flow/fills`                 | Create a fill (start a submission). |
| `PATCH`  | `/flow/fills/:id`             | Update fill metadata / status.      |
| `DELETE` | `/flow/fills/:id`             | Soft-delete a fill.                 |
| `GET`    | `/flow/fills/:fillId/answers` | List answers in the fill.           |
| `POST`   | `/flow/fills/:fillId/answers` | Add an answer.                      |
| `PUT`    | `/flow/fills/:fillId/answers` | Bulk-replace the fill's answers.    |
| `POST`   | `/flow/fills/:fillId/waivers` | Add a waiver (justified skip).      |
| `GET`    | `/flow/fills/:fillId/waivers` | List waivers.                       |

## Answers (`/flow/answers`)

| Method   | Path                | Description             |
| -------- | ------------------- | ----------------------- |
| `PATCH`  | `/flow/answers/:id` | Update a single answer. |
| `DELETE` | `/flow/answers/:id` | Soft-delete an answer.  |

## Notes

- The `PUT /flow/fills/:fillId/answers` bulk-replace is the common path for "save the whole form" — it's transactional. Single-answer `POST`/`PATCH` is for incremental autosave.
- A **waiver** records _why_ a required question was skipped; downstream policy may require waivers to be approved.
- Fills reference the form they instantiate; deleting the form does not delete existing fills (soft-delete only).
