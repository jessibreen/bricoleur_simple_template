#!/usr/bin/env bash
set -euo pipefail

# One-command local preview. Serves the repository root at http://127.0.0.1:8000/
cd "$(dirname "$0")/.."
exec python3 scripts/serve.py
