#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: scripts/cloudfront-bootstrap.sh --origin-bucket st-core-hosting [--domain app.example.com]

Creates a CloudFront distribution fronting an S3 static site bucket. Requires AWS CLI credentials with cloudfront permissions.
USAGE
}

BUCKET=""
DOMAIN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --origin-bucket) BUCKET="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$BUCKET" ]]; then
  echo "--origin-bucket is required" >&2
  exit 1
fi

ALIASES='"Aliases": {"Quantity": 0}'
if [[ -n "$DOMAIN" ]]; then
  ALIASES='"Aliases": {"Quantity": 1, "Items": ["'"$DOMAIN"'"]}'
fi

read -r -d '' CONFIG <<JSON || true
{
  "CallerReference": "$(date +%s)",
  "Comment": "st-core frontend",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "${BUCKET}-origin",
        "DomainName": "${BUCKET}.s3.amazonaws.com",
        "S3OriginConfig": {"OriginAccessIdentity": ""}
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "${BUCKET}-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
    "ForwardedValues": {"QueryString": false, "Cookies": {"Forward": "none"}},
    "TrustedSigners": {"Enabled": false, "Quantity": 0}
  },
  ${ALIASES}
}
JSON

DIST_ID=$(aws cloudfront create-distribution --distribution-config "${CONFIG}" --query 'Distribution.Id' --output text)

echo "Created distribution ${DIST_ID}"
