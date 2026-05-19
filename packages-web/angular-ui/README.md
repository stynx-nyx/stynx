# @stynx-web/angular-ui

Angular 20 UI primitives for STYNX web applications.

Exports:
- `stynx-banner`
- `stynx-toast-container`
- `stynx-empty-state`
- `stynx-pagination`
- `stynx-table`
- `stynx-loading-spinner`
- `stynx-confirm-dialog`
- `stynx-icon`

## Icons

`stynx-icon` renders the package sprite with `<use href="#name">`. The APF
build ships the sprite at `assets/sprite.svg`; host apps should inline that
sprite once, or otherwise mount matching SVG symbols, so every icon instance can
resolve its symbol.

Current icon names:

- `arrow-right`
- `check`
- `chevron-left`
- `chevron-right`
- `clock`
- `close`
- `error`
- `file`
- `form`
- `info`
- `plus`
- `save`
- `task`
- `trash`
- `user`
- `waiver`
- `warning`

Verification:

```bash
pnpm --filter @stynx-web/angular-ui test
pnpm --filter @stynx-web/angular-ui typecheck
```
