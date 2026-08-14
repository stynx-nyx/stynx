# STYNX image-size security fork

This package is a repository-owned fork of `image-size@2.0.2`, retained under
its MIT license because no upstream patched release exists for
GHSA-w3rx-r6r6-pgpr or GHSA-5p2g-fcmc-qvqq.

The fork rejects box and ICNS entry lengths smaller than their eight-byte
headers. The canonical SBOM verifier exercises the ICNS, JXL, and HEIF
infinite-loop paths against the committed distribution before accepting the
component roster. Remove this fork once an upstream release provides equivalent
fixes and passes the STYNX security closure.
