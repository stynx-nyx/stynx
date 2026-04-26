# @stynx/sessions

Redis-backed session management for STYNX, including:

- RS256 access-token signing with public JWKS exposure at `/.well-known/jwks.json`
- opaque refresh-token rotation with reuse detection and family kill
- secondary Redis indexes by user and tenant for bulk revocation
- append-only `auth.sessions` mirror writes through `@stynx/data`

Web storage contract:

- keep the access token in memory only
- keep the refresh token in `sessionStorage`
