#!/bin/sh
set -eu
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
NODE_DIR="$ROOT_DIR/.toolchain/node-v20.19.0/bin"
if [ ! -x "$NODE_DIR/node" ]; then
  echo "Local Node 20 toolchain missing at $NODE_DIR" >&2
  exit 1
fi
PATH="$NODE_DIR:$PATH"
export PATH
exec "$@"
