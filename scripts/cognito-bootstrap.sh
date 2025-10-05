#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: scripts/cognito-bootstrap.sh --region us-east-1 --name st-core --callback https://app.example.com/login

Creates an AWS Cognito user pool, app client, and hosted UI domains. Requires AWS CLI v2 and credentials with cognito-idp permissions.
USAGE
}

REGION="us-east-1"
NAME="st-core"
CALLBACK=""
LOGOUT_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region) REGION="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --callback) CALLBACK="$2"; shift 2 ;;
    --logout) LOGOUT_URL="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$CALLBACK" ]]; then
  echo "--callback is required" >&2
  usage
  exit 1
fi

USER_POOL_ID=$(aws cognito-idp create-user-pool \
  --region "$REGION" \
  --pool-name "$NAME" \
  --policies '{"PasswordPolicy":{"MinimumLength":12,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":true}}' \
  --auto-verified-attributes email \
  --query 'UserPool.Id' --output text)

echo "Created user pool: ${USER_POOL_ID}"

APP_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --region "$REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --client-name "${NAME}-app" \
  --generate-secret \
  --supported-identity-providers COGNITO \
  --callback-urls "[\"$CALLBACK\"]" \
  --logout-urls "[\"${LOGOUT_URL:-$CALLBACK}\"]" \
  --query 'UserPoolClient.ClientId' --output text)

echo "Created app client: ${APP_CLIENT_ID}"

echo "Remember to configure a domain: aws cognito-idp create-user-pool-domain --domain ${NAME//_/}-auth --user-pool-id $USER_POOL_ID"
