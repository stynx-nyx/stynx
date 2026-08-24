# gov.br Login federation through Amazon Cognito

**Status:** implementation runbook. It is not production validation. The first
consumer is the future PORTAL application; do not declare this integration live
until PORTAL completes the staging rehearsal described below.

## Boundary and architecture

STYNX remains a Cognito-token verifier. gov.br is not a verifier dependency,
and `packages/signature/src/govbr-sandbox.ts` remains a separate signing
sandbox. Configure Login Único as an OIDC identity provider (IdP) in the
existing Cognito **user pool**:

```text
Citizen → gov.br Login Único (OIDC authorization code + PKCE)
        → Cognito user-pool OIDC IdP → Cognito-issued JWT
        → PORTAL → unchanged STYNX Cognito token verifier
```

Cognito acts as the relying party to gov.br and normalizes the provider claims
into its user profile before issuing its own tokens. This is user-pool
federation, not Cognito Identity Pools. Amazon Cognito documents this bridge
model and its OIDC authorization-code flow in [third-party IdP federation](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation.html)
and [OIDC IdP flow](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-flow.html).

## Prerequisites and credential boundary

1. The responsible public authority requests separate homologation and
   production credentials through the [official gov.br integration service](https://www.gov.br/governodigital/pt-br/estrategias-e-governanca-digital/transformacao-digital/servico-de-integracao-aos-produtos-de-identidade-digital-gov.br).
   It is limited to eligible public-service providers and requires a public
   official/manager. Production also requires an official government domain,
   as documented by the [Login Único credential process](https://acesso.gov.br/roteiro-tecnico/solicitacaocredencialprocesso.html).
2. Register Cognito's callback URL with gov.br. The integration guide requires
   HTTPS and native browser use rather than a mobile WebView; use a claimed
   HTTPS redirect / universal link for a mobile PORTAL shell, not embedded
   authentication.
3. Store the gov.br client secret in the approved secrets manager. Never put it
   in an app bundle, git, a Cognito custom attribute, or a STYNX environment
   file checked into source.
4. Obtain the provider's exact staging and production issuer/discovery URLs,
   supported scopes, redirect and logout allowlists, and sample ID-token and
   userinfo claims. Do not infer claim names from this runbook.

## Configure the Cognito pool

### 1. Add only mutable destination attributes

Before adding the IdP, create the minimum mutable custom attributes required
for the mapping, for example:

| Cognito destination        | Expected source                        | Use                                                |
| -------------------------- | -------------------------------------- | -------------------------------------------------- |
| `custom:cpf`               | credential-approved CPF claim          | citizen correlation; retain only under LGPD policy |
| `custom:govbr_trust_level` | approved gov.br reliability/selo claim | authorization input                                |
| `custom:govbr_selos`       | approved selo/reliability values       | authorization input/audit                          |

Use mutable attributes and give the PORTAL app client write access to each
mapped destination. Cognito refreshes mapped values on sign-in; mapping an IdP
claim into an immutable attribute makes a subsequent sign-in fail. Custom
attributes appear in Cognito ID tokens as `custom:*` strings, and cannot be
renamed or deleted after creation. See AWS's [attribute mapping constraints](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-specifying-attribute-mapping.html)
and [custom attribute rules](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html).

CPF is sensitive personal data. Do not use it as Cognito's username or expose
it to browser logs. Make the `sub` / Cognito federated username the technical
subject identifier; bind CPF only in the protected citizen-profile boundary.

### 2. Create the gov.br OIDC IdP

In **Cognito User Pools → Social and external providers → Add identity
provider → OpenID Connect**:

1. Name it `govbr` (record the actual configured name; it becomes part of
   Cognito's federated username).
2. Prefer discovery from the credential-approved gov.br issuer. If gov.br
   instructs manual setup, enter its `authorization`, `token`, `userinfo`, and
   `jwks_uri` endpoints exactly; Cognito requires HTTPS endpoints.
3. Enter the gov.br-issued client ID and secret and request only the approved
   scopes. The official Login Único example uses `response_type=code`,
   `openid`, and optional profile/reliability scopes; scope availability is
   credential-specific. Use PKCE S256 for the PORTAL public client.
4. Map `sub` implicitly to Cognito's federated username, `email` to `email`
   only when it is actually released, the approved CPF claim to `custom:cpf`,
   and approved reliability/selo claims to the two custom attributes above.
   Map `email_verified` when available. Cognito needs mappings for every
   required pool attribute.
5. Save, then use `describe-identity-provider` (or an IaC equivalent) to retain
   a redacted configuration review record. Do not record client secrets.

The gov.br [technical integration guide](https://acesso.gov.br/roteiro-tecnico/iniciarintegracao.html)
describes the authorization-code request and its `govbr_confiabilidades`
scopes. Exact returned claim names and values must be confirmed from the
credentialed staging response before mapping.

### 3. Configure PORTAL's Cognito app client

Create a dedicated PORTAL app client (do not reuse a staff client):

1. Enable authorization-code flow. For a browser/PWA or mobile public client,
   require PKCE S256 and do not issue a client secret to the browser.
2. Add only PORTAL's exact HTTPS callback and logout URLs. Enable the `govbr`
   provider for that app client alongside any explicitly approved local
   provider.
3. Grant read access only to required profile attributes. Grant write access to
   mapped custom attributes so Cognito can refresh them; the public client must
   not be able to arbitrarily update them through an application profile API.
4. Configure Cognito's managed-login domain if using Hosted UI, or configure
   the same authorize endpoint in PORTAL for the custom redirect flow.

**Hosted UI / managed login:** simplest operational choice. Redirect the user
to Cognito `/oauth2/authorize` with `identity_provider=govbr`; Cognito handles
the provider callback at `/oauth2/idpresponse` and returns to PORTAL.

**Custom flow:** PORTAL controls the initial UI but still redirects through the
Cognito authorization endpoint and uses the authorization-code exchange with
PKCE. It must never redirect the browser directly to gov.br and then attempt
to make STYNX accept a gov.br token. Cognito remains the only issuer accepted
by STYNX.

## Surface assurance into STYNX permissions

Treat gov.br reliability/selo data as an authentication assurance signal, not
as a STYNX role or blanket privilege.

1. Preserve the raw, approved values in `custom:govbr_trust_level` and
   `custom:govbr_selos` for a short, policy-approved period and audit the
   mapping version.
2. In a Cognito pre-token-generation trigger owned by PORTAL, translate a
   reviewed allowlist into explicit application permissions such as
   `portal:identity:assurance:prata` or
   `portal:identity:assurance:ouro`. Never derive a permission from an
   unrecognized selo value.
3. Emit those permissions in the Cognito token claim selected by the consumer;
   keep staff RBAC and tenant claims independent. The trigger and its policy
   mapping need an Owner/Architect-approved authorization rule before use.
4. Configure the adopter verifier to read the selected claim. PEC's composition
   root (`pec/apps/api/src/stynx-runtime.ts`) is the reference shape:

```dotenv
PEC_AUTH_MODE=cognito
STYNX_COGNITO_ISSUER=https://cognito-idp.<region>.amazonaws.com/<user-pool-id>
STYNX_COGNITO_AUDIENCE=<portal-app-client-id>
STYNX_COGNITO_JWKS_URI=https://cognito-idp.<region>.amazonaws.com/<user-pool-id>/.well-known/jwks.json
STYNX_COGNITO_TOKEN_USE=id
STYNX_COGNITO_ROLE_CLAIMS=cognito:groups,roles
STYNX_COGNITO_PERMISSION_CLAIMS=permissions,custom:govbr_permissions
STYNX_COGNITO_TENANT_CLAIMS=tenants,custom:tenant_id,https://stynx.dev/tenant
```

Use `id` only where the consumer deliberately validates ID tokens; the normal
API access-token path must retain its expected `token_use`. Verify issuer,
audience/client ID, signature/JWKS, expiration, token use, and the allowlisted
permission values. Do not set `STYNX_COGNITO_PERMISSION_CLAIMS` directly to
the raw selo claim unless the values are themselves the approved STYNX
permission vocabulary.

## Environment matrix

| Concern              | Homologation / staging                                                     | Production                                                                   |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| gov.br registration  | Separate test credential and approved test callback                        | Separate production credential and official government-domain callback       |
| Cognito              | Dedicated non-production user pool/app client and test data                | Production pool/app client, least privilege, managed secret rotation         |
| IdP endpoints/claims | Use only the credential-approved staging metadata and sample tokens        | Use only approved production metadata; revalidate issuer/JWKS before cutover |
| Authorization        | Test only reviewed assurance-to-permission mappings                        | Enable only mappings approved for PORTAL                                     |
| Evidence             | Redacted authorize/callback trace, token-claim comparison, rejection cases | Change record, redacted config diff, alerting and rollback evidence          |

## Validation, rollback, and open items

**Staging exit test:** perform an actual native-browser authorization-code +
PKCE login; prove Cognito, not gov.br, issued the token; verify its signature
against Cognito JWKS; verify CPF is not exposed in browser telemetry; exercise
each approved assurance level and an unknown/missing value; prove STYNX grants
only the mapped permissions; and record first-login audit and logout behavior.

**Rollback:** remove `govbr` from the PORTAL app client first, then disable the
IdP; revoke staging sessions and rotate the gov.br secret if it was exposed.
Do not delete users or custom attributes as a rollback shortcut.

**Credential-gated open items (must be resolved before validation):**

- authorized public-service owner, CNPJ/agency process, test and production
  gov.br credentials;
- exact issuer/discovery endpoints, redirect/logout URLs, scopes, CPF and
  selo/reliability claim names and value vocabulary;
- PORTAL Cognito pool/client split and the approved pre-token-generation
  permission mapping policy;
- LGPD retention, access, audit, and incident ownership for CPF and assurance
  data; and
- a real PORTAL staging app, native-browser/mobile redirect configuration, and
  end-to-end rehearsal evidence.
