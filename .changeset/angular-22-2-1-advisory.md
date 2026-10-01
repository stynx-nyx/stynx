---
'@stynx-nyx/angular': patch
'@stynx-nyx/angular-audit': patch
'@stynx-nyx/angular-auth': patch
'@stynx-nyx/angular-flow': patch
'@stynx-nyx/angular-i18n': patch
'@stynx-nyx/angular-iam': patch
'@stynx-nyx/angular-profile': patch
'@stynx-nyx/angular-sessions': patch
'@stynx-nyx/angular-storage': patch
'@stynx-nyx/angular-tenancy': patch
'@stynx-nyx/angular-trash': patch
'@stynx-nyx/angular-ui': patch
'@stynx-nyx/sdk': patch
---

Build and test the Angular packages against Angular 22.2.1, the release that fixes
GHSA-ff3f-86qr-9cv3 (`@angular/router` SSR denial of service). The supported
peer range stays `>=22.0.0 <23`; consumers on 22.0–22.1 should upgrade their
own Angular install to 22.2.0 or later.
