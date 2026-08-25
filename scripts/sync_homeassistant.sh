#!/usr/bin/env bash
# ==============================================================================
# Newcastle Weather - Home Assistant Cron Wrapper
# ==============================================================================
# Prevents overlapping executions using a lock file and runs sync_homeassistant.py

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Run the python sync script (locking is handled via fcntl in python)
cd "$REPO_DIR"
exec /usr/bin/env python3 "$SCRIPT_DIR/sync_homeassistant.py" "$@"

