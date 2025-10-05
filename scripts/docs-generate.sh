#!/usr/bin/env bash
set -euo pipefail

(cd backend && npm run swagger:export) > docs/api/openapi.json

echo "Generated docs/api/openapi.json"
