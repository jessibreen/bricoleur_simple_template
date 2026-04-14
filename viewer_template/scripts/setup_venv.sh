#!/usr/bin/env bash
set -euo pipefail

# Create and activate a local virtual environment for running helper scripts.
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo "Virtual environment ready."
echo "Start server with one command: ./scripts/start_local.sh"
echo "Or manually: source .venv/bin/activate && python scripts/serve.py"
