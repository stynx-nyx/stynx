# create-stynx-app

Thin scaffold CLI for a STYNX Angular starter application.

## Use

```sh
node tools/create-stynx-app/bin.mjs my-stynx-app
```

The CLI creates `my-stynx-app/` from the local template and runs `pnpm install` in the new app.

For quick validation without dependency installation:

```sh
node tools/create-stynx-app/bin.mjs /tmp/my-stynx-app --no-install
```

## Options

- `--no-install` scaffolds files and skips `pnpm install`.
- `--dry-run` prints the target path without writing files.
- `--force` allows writing into an existing directory.

The generated app is a standalone Angular 20 app wired through `provideStynxDefaults(...)`. Its default providers include the STYNX Angular core package, OIDC auth via `@stynx-web/angular-auth`, tenant resolution, and an empty Flow client placeholder using `@stynx-web/angular-flow` and `@stynx-web/sdk`.
