#!/bin/sh
set -eu

BUCKET="${STYNX_STORAGE_BUCKET:-stynx-docs-local-us-east-1}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

if awslocal s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  exit 0
fi

awslocal s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
