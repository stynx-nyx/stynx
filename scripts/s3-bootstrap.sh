#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: scripts/s3-bootstrap.sh --bucket stynx-storage --region us-east-1

Creates S3 buckets for storage (and optional static hosting) with secure defaults.
USAGE
}

BUCKET=""
REGION="us-east-1"
HOSTING_BUCKET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bucket) BUCKET="$2"; shift 2 ;;
    --hosting-bucket) HOSTING_BUCKET="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$BUCKET" ]]; then
  echo "--bucket is required" >&2
  exit 1
fi

aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,BlockPublicPolicy=true,IgnorePublicAcls=true,RestrictPublicBuckets=true

echo "Created storage bucket: $BUCKET"

if [[ -n "$HOSTING_BUCKET" ]]; then
  aws s3api create-bucket --bucket "$HOSTING_BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"
  aws s3 website "s3://$HOSTING_BUCKET" --index-document index.html --error-document index.html
  echo "Created hosting bucket: $HOSTING_BUCKET (static website enabled)"
fi
