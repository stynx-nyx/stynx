# Prompt: Update Frontend and Backend (stynx modernization + Git patching)

ROLE:
You are a GPT-5-Codex low-level automation agent operating in a git-controlled monorepo (stynx).
Your goal is to perform code modernization, component migration, and environment setup, while creating clean, logically separated commits and patches automatically.

You must generate, stage, and commit changes atomically by concern.
Follow the semantic commit convention and produce patch files for later review.

⸻

## 1. BACKEND: Create .env.example
1. Read all environment-dependent code in:
   - ./backend/src/config
   - main.ts
   - modules/auth, modules/core, modules/storage, modules/logging
2. Create `.env.example` in the backend root with placeholders and inline comments, including:

```
# --- Application ---
APP_NAME=stynx
APP_ENV=development
APP_PORT=3000
LOG_LEVEL=debug

# --- PostgreSQL ---
PGHOST=localhost
PGPORT=5432
PGDATABASE=stynx
PGUSER=stynx_user
PGPASSWORD=change_me
PGSSL=false

# --- AWS Cognito ---
COGNITO_REGION=us-east-1
COGNITO_USERPOOL_ID=us-east-1_example
COGNITO_CLIENT_ID=abc123
COGNITO_CLIENT_SECRET=secret
COGNITO_REDIRECT_URL=http://localhost:4200/login/callback
COGNITO_LOGOUT_URL=http://localhost:4200/logout

# --- AWS S3 ---
S3_BUCKET_UPLOADS=stynx-uploads
S3_BUCKET_PUBLIC=stynx-public
S3_REGION=us-east-1
S3_ACCESS_KEY=AKIAxxxx
S3_SECRET_KEY=xxxx

# --- JWT / Security ---
JWT_SECRET=change_me
JWKS_URI=https://cognito-idp.us-east-1.amazonaws.com/.../.well-known/jwks.json
TOKEN_EXPIRATION_MINUTES=60

# --- Tenancy / Superadmin ---
DEFAULT_TENANCY_ID=00000000-0000-0000-0000-000000000000
SUPERADMIN_USER_ID=00000000-0000-0000-0000-000000000000

# --- Notifications ---
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=user
SMTP_PASS=pass

# --- Monitoring ---
SENTRY_DSN=
METRICS_ENABLED=true
HEALTHCHECK_INTERVAL=30000

# --- URLs ---
API_BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:4200
```

3. Commit sequence:

```
git add backend/.env.example
git commit -m "chore(env): add backend .env.example with all relevant variables"
git format-patch -1 HEAD --output-directory ./patches
```

⸻

## 2. FRONTEND MODERNIZATION
Perform all operations inside `./frontend/src/app`.

### 2.1 Split Templates and Stylesheets
- For each component with inline templates or styles:
  - Extract template → `component.html`
  - Extract styles → `component.scss`
  - Update component decorator with:

```
@Component({
  selector: '...',
  templateUrl: './component.html',
  styleUrls: ['./component.scss'],
})
```

- Maintain folder structure.

Commit:

```
git add frontend/src/app
git commit -m "refactor(frontend): split inline templates and styles into separate files"
git format-patch -1 HEAD --output-directory ./patches
```

### 2.2 Convert Legacy Structural Directives
- Replace all `*ngIf`, `*ngFor`, and similar with new Angular control flow:

```
@if (condition) { ... } @else { ... }
@for (item of items; track item.id) { ... }
```

- Ensure syntax is consistent with Angular 18+.

Commit:

```
git add frontend/src/app
git commit -m "refactor(frontend): migrate *ngIf/*ngFor to Angular @if/@for syntax"
git format-patch -1 HEAD --output-directory ./patches
```

### 2.3 Adopt `inject()` Syntax
- Replace all constructor-based DI with:

```
service = inject(ServiceClass);
```

- Remove now-empty constructors.

Commit:

```
git add frontend/src/app
git commit -m "refactor(frontend): migrate dependency injection to inject() API"
git format-patch -1 HEAD --output-directory ./patches
```

⸻

## 3. ADMIN/USER MANAGEMENT IMPORT
1. Copy all features from `../porm/frontend/src/app/admin/users`:
   - Components: UsersListComponent, UserDetailComponent, dialogs, etc.
   - Services: UsersService, RolesService, TenancyService.
   - Models and shared types.
2. Integrate routes under `/admin/users`, `/admin/roles`, `/admin/tenancies`.
3. Modify `UserDetailComponent`:
   - Add tabs or panels for:
     - Role management (`cognito:groups`)
     - Tenancy affiliations (user ↔ tenancy)
     - Account/email/phone confirmation buttons
   - Call stubbed backend endpoints:
     - `POST /admin/users/:id/confirm`
     - `POST /admin/users/:id/confirm-email`
     - `POST /admin/users/:id/confirm-phone`
4. Add dialogs for confirmation and snackbars for feedback.
5. Add unit tests under `./test/frontend/admin-users`.

Commit:

```
git add frontend/src/app/admin/users test/frontend/admin-users
git commit -m "feat(admin): integrate user management module from porm with role and tenancy handling"
git format-patch -1 HEAD --output-directory ./patches
```

⸻

## 4. VALIDATION & LINTING
Run all checks and commit fixes if needed:

```
npm run lint --workspace frontend
npm run test --workspace frontend
npm run build --workspace frontend
```

If automated formatting or lint fixes are applied:

```
git add .
git commit -m "chore(frontend): lint and format after modernization"
git format-patch -1 HEAD --output-directory ./patches
```

⸻

## 5. DOCUMENTATION UPDATES
1. Update `README.md` and `docs/dev/frontend.md`:
   - Note new syntax and conventions.
   - Document `.env.example`.
2. Commit:

```
git add README.md docs/dev/frontend.md
git commit -m "docs: update readme and developer guide with modernization steps"
git format-patch -1 HEAD --output-directory ./patches
```

⸻

## 6. PATCH PACKAGING
After all commits:

```
mkdir -p ./patches
git format-patch --output-directory ./patches --cover-letter $(git merge-base main HEAD)..HEAD
```

This produces atomic patch files:

```
patches/
  0001-chore-env-add-backend-dotenv-example.patch
  0002-refactor-frontend-split-inline-templates.patch
  0003-refactor-frontend-migrate-ngif-ngfor.patch
  0004-refactor-frontend-migrate-inject-syntax.patch
  0005-feat-admin-integrate-user-mgmt.patch
  0006-chore-lint-format.patch
  0007-docs-update-readme-devguide.patch
  cover-letter
```

Include metadata in the cover letter:

```
Subject: [PATCH 0/7] stynx frontend/backend modernization
```

⸻

## 7. FINAL SUMMARY
After patch creation:
1. Generate `SUMMARY.md` listing:
   - Each commit, short description, modified file count.
2. Generate `TODO.md` listing:
   - Manual review tasks (Cognito stubs, UI review, test extension).

⸻

Would you like me to add automated Git tagging and changelog generation (so the agent finalizes version bump, tags as v0.1.0, and generates CHANGELOG.md from commits)?
