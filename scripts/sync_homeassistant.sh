#!/usr/bin/env bash
# ==============================================================================
# Newcastle Weather - Home Assistant Cron Wrapper
# ==============================================================================
# Prevents overlapping executions using a lock file and runs sync_homeassistant.py

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_FILE="/tmp/ha_weather_sync.lock"

# Ensure single execution if flock is available
if command -v flock >/dev/null 2>&1; then
    exec 200>"$LOCK_FILE"
    if ! flock -n 200; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Another instance of sync_homeassistant is already running. Exiting."
        exit 0
    fi
fi

# Run the python sync script
cd "$REPO_DIR"
/usr/bin/env python3 "$SCRIPT_DIR/sync_homeassistant.py" "$@"

