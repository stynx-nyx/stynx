# PORT-99 — Provenance + finalize README

**Produces:** `porting-pack/99-PROVENANCE.md` and updates
`porting-pack/00-README.md` to reflect the now-populated pack.
**Depends on:** all prior pack files.
**Branch:** `porting-pack/99-finalize`.

## Mission

Reproducibility metadata. Final pass over the README to flip every
file's status from `⏳ pending` to `✅`.

## Steps

1. Capture:
   - `git rev-parse HEAD`
   - `git rev-parse --abbrev-ref HEAD`
   - Generation start/end timestamps (UTC).
   - Generator identity (model, harness).
   - Spec version found.
2. List every file the generators opened across the sequence
   (each prompt's "Read" section is the source of truth).
3. Compute pack word count: `wc -w porting-pack/**/*.md`.
4. Write `99-PROVENANCE.md` with:
   - Header metadata.
   - Files-read flat list.
   - Word count.
   - Generation duration.
5. Update `00-README.md`:
   - File-index table: flip statuses to ✅.
   - Provenance section: link to `99-PROVENANCE.md`.

## Acceptance

- `99-PROVENANCE.md` exists, fully populated.
- `00-README.md` no longer shows any ⏳ entries.
- `git diff --stat` shows changes only under `porting-pack/`.

## Final summary

The last action of this prompt is to print to stdout:

> Pack at `./porting-pack/`. NN files. NNNN words. Top open gap:
> <one sentence from `18-GAPS-AND-OPEN-QUESTIONS.md`>.
