---
'@stynx-nyx/angular': minor
'@stynx-nyx/angular-audit': minor
'@stynx-nyx/angular-auth': minor
'@stynx-nyx/angular-flow': minor
'@stynx-nyx/angular-i18n': minor
'@stynx-nyx/angular-iam': minor
'@stynx-nyx/angular-profile': minor
'@stynx-nyx/angular-sessions': minor
'@stynx-nyx/angular-storage': minor
'@stynx-nyx/angular-tenancy': minor
'@stynx-nyx/angular-trash': minor
'@stynx-nyx/angular-ui': minor
'@stynx-nyx/audit': minor
'@stynx-nyx/auth': minor
'@stynx-nyx/backend': minor
'@stynx-nyx/cli': minor
'@stynx-nyx/contracts': minor
'@stynx-nyx/core': minor
'@stynx-nyx/data': minor
'@stynx-nyx/feature-flags': minor
'@stynx-nyx/flow': minor
'@stynx-nyx/health': minor
'@stynx-nyx/i18n': minor
'@stynx-nyx/idempotency': minor
'@stynx-nyx/jobs': minor
'@stynx-nyx/integration-adapter': minor
'@stynx-nyx/logging': minor
'@stynx-nyx/notifications': minor
'@stynx-nyx/mobile-runtime': minor
'@stynx-nyx/offline-sync': minor
'@stynx-nyx/outbox': minor
'@stynx-nyx/pdf': minor
'@stynx-nyx/pdf-a': minor
'@stynx-nyx/pdf-a-vera-docker': minor
'@stynx-nyx/preferences': minor
'@stynx-nyx/privacy': minor
'@stynx-nyx/ratelimit': minor
'@stynx-nyx/sdk': minor
'@stynx-nyx/sessions': minor
'@stynx-nyx/signature': minor
'@stynx-nyx/storage': minor
'@stynx-nyx/tenancy': minor
'@stynx-nyx/testing': minor
'@stynx-nyx/worklist': minor
---

Angular 22. The Angular packages are built with @angular/compiler-cli 22.0.1, ng-packagr 22 and TypeScript 6.0.3, and their peer ranges move from `>=20.3.0 <22` to `>=22.0.0 <23`. Owner decision 2026-09-12: this ships as the 1.3.0 line. **1.3.x requires Angular 22**; applications on Angular 20 or 21 must stay on 1.2.x. Backend packages in the fixed group are re-released unchanged.

The published declaration files of nine Angular packages also change: the previous ng-packagr 21 / TypeScript 5.9 toolchain dropped `| null` and `| undefined` from emitted generic type arguments (for example `Signal<ErrorBannerState>` where the source declares `Signal<ErrorBannerState | null>`, `InjectionToken<AuthProvider>` for `InjectionToken<AuthProvider | null>`). Angular 22 emits the types as written in the sources. Consumers that relied on the narrower, incorrect declarations will see new strict-null errors; the runtime behaviour is unchanged.
