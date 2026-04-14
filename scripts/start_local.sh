#!/usr/bin/env bash
set -euo pipefail

# One-command local start for non-coders.
if [[ ! -d .venv ]]; then
  echo "No .venv found. Creating one now..."
  ./scripts/setup_venv.sh
fi

source .venv/bin/activate
exec python scripts/serve.py
