#!/usr/bin/env python3
"""
Home Assistant to Newcastle Weather Sync Script
==============================================
Fetches live water temperature (from Zigbee MQTT sensor) and measured tide data
from Home Assistant, formats it into `live_data.json`, and commits & pushes to GitHub.

Designed to be run as a 30-minute cron job.

Usage:
    python3 sync_homeassistant.py [--config config.json] [--dry-run] [--no-push]
"""

import argparse
import datetime
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

# Default configuration
DEFAULT_CONFIG = {
    "ha_url": os.getenv("HA_URL", "http://homeassistant.local:8123"),
    "ha_token": os.getenv("HA_TOKEN", ""),
    "water_temp_entity": os.getenv("HA_WATER_TEMP_ENTITY", "sensor.damariscotta_river_temperature"),
    "measured_tide_entity": os.getenv("HA_TIDE_ENTITY", "sensor.measured_tide_height"),
    "output_file": os.getenv("LIVE_DATA_OUTPUT", "live_data.json"),
    "repo_dir": os.getenv("REPO_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "history_hours": int(os.getenv("HISTORY_HOURS", "48")),
    "git_push": os.getenv("GIT_PUSH", "true").lower() in ("true", "1", "yes"),
    "git_remote": os.getenv("GIT_REMOTE", "origin"),
    "git_branch": os.getenv("GIT_BRANCH", "main")
}


def load_config(config_path=None):
    """Load config from JSON file if provided or if default ha_config.json exists."""
    config = dict(DEFAULT_CONFIG)
    candidate_paths = []
    if config_path:
        candidate_paths.append(config_path)
    else:
        candidate_paths.extend([
            os.path.join(config["repo_dir"], "ha_config.json"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "ha_config.json"),
            os.path.expanduser("~/.ha_weather_config.json")
        ])

    for path in candidate_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    file_conf = json.load(f)
                    config.update(file_conf)
                print(f"[INFO] Loaded configuration from {path}")
                break
            except Exception as e:
                print(f"[WARN] Failed to parse config file at {path}: {e}")
    return config


def ha_api_get(endpoint, ha_url, ha_token):
    """Make an authenticated GET request to Home Assistant REST API."""
    url = f"{ha_url.rstrip('/')}/api/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {ha_token}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"[ERROR] HTTP Error {e.code} for {url}: {e.read().decode('utf-8')}")
        raise
    except Exception as e:
        print(f"[ERROR] Request failed for {url}: {e}")
        raise


def parse_float_safe(val):
    """Convert value to float if possible, otherwise return None."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


try:
    import zoneinfo
    EASTERN_TZ = zoneinfo.ZoneInfo("America/New_York")
except Exception:
    EASTERN_TZ = datetime.timezone(datetime.timedelta(hours=-4))  # Fallback EDT


def iso_to_est_str(iso_str):
    """Convert ISO UTC timestamp string to Eastern Time 'YYYY-MM-DD HH:MM' format."""
    try:
        cleaned = iso_str.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        dt_est = dt.astimezone(EASTERN_TZ)
        return dt_est.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return iso_str[:16].replace("T", " ")


def filter_dense_history(points, min_interval_minutes=5):
    """Keep at most one reading every min_interval_minutes to keep live_data.json compact."""
    if not points:
        return []
    filtered = []
    last_dt = None
    for pt in points:
        try:
            cur_dt = datetime.datetime.strptime(pt["t"], "%Y-%m-%d %H:%M")
            if last_dt is None or (cur_dt - last_dt).total_seconds() >= (min_interval_minutes * 60):
                filtered.append(pt)
                last_dt = cur_dt
            else:
                # Update the last point value to latest in the interval
                filtered[-1] = pt
        except Exception:
            filtered.append(pt)
    return filtered


def fetch_sensor_data(config):
    """Fetch current state and history for water temperature and tide."""
    ha_url = config["ha_url"]
    ha_token = config["ha_token"]
    water_entity = config["water_temp_entity"]
    tide_entity = config["measured_tide_entity"]
    history_hours = config["history_hours"]

    if not ha_token:
        raise ValueError("Home Assistant Long-Lived Access Token is missing. Set HA_TOKEN or ha_config.json.")

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    start_utc = now_utc - datetime.timedelta(hours=history_hours)
    start_iso = start_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Fetch current states
    water_state = None
    tide_state = None

    try:
        if water_entity:
            water_state = ha_api_get(f"states/{water_entity}", ha_url, ha_token)
    except Exception as e:
        print(f"[WARN] Could not fetch current state for {water_entity}: {e}")

    try:
        if tide_entity:
            tide_state = ha_api_get(f"states/{tide_entity}", ha_url, ha_token)
    except Exception as e:
        print(f"[WARN] Could not fetch current state for {tide_entity}: {e}")

    # Fetch history
    entities_to_query = [e for e in [water_entity, tide_entity] if e]
    history_endpoint = f"history/period/{start_iso}?filter_entity_id={','.join(entities_to_query)}"
    
    raw_history = []
    try:
        raw_history = ha_api_get(history_endpoint, ha_url, ha_token)
    except Exception as e:
        print(f"[WARN] Could not fetch entity history: {e}")

    water_hist_map = []
    tide_hist_map = []

    for entity_series in raw_history:
        if not entity_series:
            continue
        entity_id = entity_series[0].get("entity_id")
        for item in entity_series:
            val = parse_float_safe(item.get("state"))
            if val is None:
                continue
            ts_str = item.get("last_updated") or item.get("last_changed")
            formatted_time = iso_to_est_str(ts_str) if ts_str else ""
            if not formatted_time:
                continue

            entry = {"t": formatted_time, "v": round(val, 2)}
            if entity_id == water_entity:
                water_hist_map.append(entry)
            elif entity_id == tide_entity:
                tide_hist_map.append(entry)

    # Current values
    current_water_temp = parse_float_safe(water_state.get("state")) if water_state else None
    water_unit = "°F"
    if water_state and "attributes" in water_state:
        unit_attr = water_state["attributes"].get("unit_of_measurement", "°F")
        if "C" in unit_attr and current_water_temp is not None:
            # Convert to °F
            current_water_temp = round((current_water_temp * 9 / 5) + 32, 1)
            water_unit = "°F"
        else:
            water_unit = unit_attr

    current_tide_height = parse_float_safe(tide_state.get("state")) if tide_state else None
    tide_unit = "ft"
    if tide_state and "attributes" in tide_state:
        tide_unit = tide_state["attributes"].get("unit_of_measurement", "ft")

    # Determine tide trend from last few history points
    trend = "steady"
    if len(tide_hist_map) >= 2:
        diff = tide_hist_map[-1]["v"] - tide_hist_map[-2]["v"]
        if diff > 0.05:
            trend = "rising"
        elif diff < -0.05:
            trend = "falling"

    # Current local timestamp with offset
    local_now = datetime.datetime.now().astimezone()
    iso_now = local_now.isoformat()

    # Append current state to history if missing
    cur_time_str = local_now.strftime("%Y-%m-%d %H:%M")
    if current_water_temp is not None:
        if not water_hist_map or water_hist_map[-1]["t"] != cur_time_str:
            water_hist_map.append({"t": cur_time_str, "v": current_water_temp})

    # Filter to at most 1 reading per 5 minutes to keep file size efficient
    water_hist_map = filter_dense_history(water_hist_map, min_interval_minutes=5)
    tide_hist_map = filter_dense_history(tide_hist_map, min_interval_minutes=5)

    payload = {
        "updated_at": iso_now,
        "water_temperature": {
            "current": current_water_temp,
            "unit": water_unit,
            "entity_id": water_entity,
            "history": water_hist_map
        },
        "measured_tide": {
            "current": current_tide_height,
            "unit": tide_unit,
            "trend": trend,
            "entity_id": tide_entity,
            "history": tide_hist_map
        }
    }
    return payload


def git_commit_and_push(repo_dir, output_file, remote="origin", branch="main"):
    """Stage, commit, and push updated data file to GitHub."""
    os.chdir(repo_dir)

    # Check status
    status = subprocess.run(["git", "status", "--porcelain", output_file], capture_output=True, text=True)
    if not status.stdout.strip():
        print("[INFO] No changes detected in live data file. Skipping git commit.")
        return False

    print(f"[INFO] Staging and committing {output_file}...")
    subprocess.run(["git", "add", output_file], check=True)
    
    commit_msg = f"chore(data): update live river temp and tide data ({datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}) [skip ci]"
    res = subprocess.run(["git", "commit", "-m", commit_msg], capture_output=True, text=True)
    print(res.stdout.strip())

    print(f"[INFO] Pushing to {remote} {branch}...")
    push_res = subprocess.run(["git", "push", remote, branch], capture_output=True, text=True)
    if push_res.returncode == 0:
        print("[SUCCESS] Successfully pushed live data to GitHub!")
        return True
    else:
        print(f"[ERROR] Git push failed:\n{push_res.stderr}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Sync Home Assistant river temp and tide data to GitHub.")
    parser.add_argument("--config", "-c", help="Path to config JSON file")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and print data without writing or pushing")
    parser.add_argument("--no-push", action="store_true", help="Write live_data.json but do not git commit/push")
    parser.add_argument("--water-entity", help="Override water temperature entity ID")
    parser.add_argument("--tide-entity", help="Override measured tide entity ID")
    parser.add_argument("--ha-url", help="Override Home Assistant URL")
    parser.add_argument("--ha-token", help="Override Home Assistant Access Token")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.water_entity:
        config["water_temp_entity"] = args.water_entity
    if args.tide_entity:
        config["measured_tide_entity"] = args.tide_entity
    if args.ha_url:
        config["ha_url"] = args.ha_url
    if args.ha_token:
        config["ha_token"] = args.ha_token

    repo_dir = config["repo_dir"]
    output_filename = config["output_file"]
    output_path = os.path.join(repo_dir, output_filename) if not os.path.isabs(output_filename) else output_filename

    print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting Home Assistant data sync...")

    try:
        data = fetch_sensor_data(config)
    except Exception as e:
        print(f"[FATAL] Failed to fetch data from Home Assistant: {e}")
        sys.exit(1)

    if args.dry_run:
        print("\n--- DRY RUN OUTPUT ---")
        print(json.dumps(data, indent=2))
        return

    # Write output JSON
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"[INFO] Successfully wrote live data to {output_path}")

    if not args.no_push and config.get("git_push", True):
        git_commit_and_push(
            repo_dir=repo_dir,
            output_file=output_path,
            remote=config.get("git_remote", "origin"),
            branch=config.get("git_branch", "main")
        )


if __name__ == "__main__":
    main()
