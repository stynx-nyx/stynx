# NPM Security Upgrade Report

- command_scopes: backend, frontend

## Audit Summary

- critical: 0
- high: 20
- moderate: 5
- low: 2
- outdated_count: 35

## Scopes

### Scope: backend

- critical: 0
- high: 0
- moderate: 0
- low: 0

Outdated packages:
| package | current | wanted | latest | type |
|---|---:|---:|---:|---|
| @aws-sdk/client-cognito-identity-provider |  | 3.990.0 | 3.990.0 |  |
| @aws-sdk/client-s3 |  | 3.990.0 | 3.990.0 |  |
| @aws-sdk/credential-providers |  | 3.990.0 | 3.990.0 |  |
| @aws-sdk/s3-request-presigner |  | 3.990.0 | 3.990.0 |  |
| @nestjs/common |  | 10.4.22 | 11.1.13 |  |
| @nestjs/config |  | 3.3.0 | 4.0.3 |  |
| @nestjs/core |  | 10.4.22 | 11.1.13 |  |
| @nestjs/platform-express |  | 10.4.22 | 11.1.13 |  |
| @nestjs/swagger |  | 7.4.2 | 11.2.6 |  |
| class-transformer |  | 0.5.1 | 0.5.1 |  |
| class-validator |  | 0.14.3 | 0.14.3 |  |
| helmet |  | 7.2.0 | 8.1.0 |  |
| jose |  | 5.10.0 | 6.1.3 |  |
| jwks-rsa |  | 3.2.2 | 3.2.2 |  |
| multer |  | 1.4.5-lts.2 | 2.0.2 |  |
| pg |  | 8.18.0 | 8.18.0 |  |
| reflect-metadata |  | 0.2.2 | 0.2.2 |  |
| rxjs |  | 7.8.2 | 7.8.2 |  |
| uuid |  | 9.0.1 | 13.0.0 |  |

### Scope: frontend

- critical: 0
- high: 20
- moderate: 5
- low: 2

Outdated packages:
| package | current | wanted | latest | type |
|---|---:|---:|---:|---|
| @angular/animations |  | 20.3.16 | 21.1.4 |  |
| @angular/cdk |  | 20.2.14 | 21.1.4 |  |
| @angular/common |  | 20.3.16 | 21.1.4 |  |
| @angular/compiler |  | 20.3.16 | 21.1.4 |  |
| @angular/core |  | 20.3.16 | 21.1.4 |  |
| @angular/forms |  | 20.3.16 | 21.1.4 |  |
| @angular/material |  | 20.2.14 | 21.1.4 |  |
| @angular/platform-browser |  | 20.3.16 | 21.1.4 |  |
| @angular/platform-browser-dynamic |  | 20.3.16 | 21.1.4 |  |
| @angular/router |  | 20.3.16 | 21.1.4 |  |
| @ngx-translate/core |  | 17.0.0 | 17.0.0 |  |
| @ngx-translate/http-loader |  | 17.0.0 | 17.0.0 |  |
| angular-oauth2-oidc |  | 20.0.2 | 20.0.2 |  |
| rxjs |  | 7.8.2 | 7.8.2 |  |
| tslib |  | 2.8.1 | 2.8.1 |  |
| zone.js |  | 0.15.1 | 0.16.0 |  |


## Recommended Path

1. Apply patch/minor upgrades first.
2. Re-run test suites before major upgrades.
3. Address critical/high vulnerabilities immediately.

