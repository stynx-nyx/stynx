#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/backend-deploy.sh --host deploy.example.com --path /opt/st-core
# Requires password-less SSH access and pm2/systemd configured on the remote host.

HOST=""
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"; shift 2 ;;
    --path)
      TARGET="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: scripts/backend-deploy.sh --host example --path /opt/st-core"; exit 0 ;;
    *)
      echo "Unknown option $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$HOST" || -z "$TARGET" ]]; then
  echo "Both --host and --path are required" >&2
  exit 1
fi

rsync -az --delete backend package.json README.md "$HOST:$TARGET/"
ssh "$HOST" "cd $TARGET/backend && npm install --production && npm run build && pm2 restart st-core || pm2 start dist/main.js --name st-core"
