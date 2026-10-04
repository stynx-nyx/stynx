# semantic-pr-title

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/semantic-pr-title.yml`
("Semantic PR Title").

Enforces Conventional Commit pull-request titles.

## Triggers

Pull requests.

## Jobs

- `semantic-pr-title`

## Credentials

Secret `DEVAI_REPO_TOKEN`.

## Notes

`semantic-pr-title` is a required check on `main`.
