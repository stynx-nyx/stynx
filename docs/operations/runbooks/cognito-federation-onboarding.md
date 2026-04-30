# Cognito Federation Onboarding

Add an OIDC identity provider to the STYNX Cognito user pool.

## Steps

- Collect issuer, client id, client secret, scopes, and claim mappings.
- Register the provider in Cognito and attach it to the app client.
- Map subject, email, groups, and tenant claims to STYNX contracts.
- Run a sandbox login and tenant-resolution test.
- Document the provider owner and rotation cadence.

## Verification

- OIDC discovery and JWKS retrieval succeed.
- A federated login creates the expected principal and tenant context.
- Permission and tenancy guards accept only mapped claims.
- Audit records the first successful federated login.

## Rollback

- Disable the provider on the app client and remove the IdP configuration.
- Revoke test sessions created during onboarding.
