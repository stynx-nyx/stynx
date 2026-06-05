# PORT-12 — Decision Trees

**Produces:** `docs/stynx/porting-pack/12-DECISION-TREES.md`.
**Depends on:** `04`, `06`, `08`.
**Branch:** `docs/stynx/porting-pack/12-decision-trees`.

## Mission

When the consuming agent is unsure which STYNX pattern applies,
this doc decides for it. Every leaf is a concrete recommendation.

## Trees to produce (each in Mermaid)

1. **Which FK annotation should I use?** (`cascade` / `block` /
   `hide` / not-soft-deletable)
2. **Should this table be soft-deletable?**
3. **Should this route be `@ReadOnly`?**
4. **Should this route be `@Idempotent`?**
5. **Should this be a system context operation?**
6. **Should this column be in the PII map, and with what strategy?**
7. **Is this column a tenant column?**

## Format per tree

````
## <Question>

<2–3 sentence framing>

```mermaid
flowchart TD
  ...
````

**Notes / edge cases:**

- ...
- ...

```

## Rules

- No leaf reads "consult the team" or "depends" without a follow-up
  question.
- Each tree's logic is grounded in the spec — cite the spec section
  that justifies the branching.
- If a question's answer genuinely requires team judgement, frame
  the leaf as a *checklist of considerations* rather than a
  deferral.

## Acceptance

- All seven trees present.
- Each Mermaid block parses (mental check: matched brackets,
  named edges).
- Each tree has a "Notes / edge cases" subsection.
```
