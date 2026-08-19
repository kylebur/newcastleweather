# Newcastle Weather - Home Assistant Live Sync & Cron Setup

This guide explains how to set up the 30-minute cron job that collects the **river water temperature** (Zigbee MQTT sensor) and **measured tide** from Home Assistant and pushes them to GitHub so the weather app displays live measurements.

---

## 1. Overview Architecture

```text
┌───────────────────────────────────────┐
│           Home Assistant              │
│  - Zigbee River Temp Sensor (MQTT)    │
│  - Measured Tide Gauge Sensor         │
└──────────────────┬────────────────────┘
                   │ REST API /states & /history
                   ▼
┌───────────────────────────────────────┐
│   Cron Job (Every 30 mins)            │
│   scripts/sync_homeassistant.py       │
│   -> Generates live_data.json         │
│   -> git add, commit, push to GitHub  │
└──────────────────┬────────────────────┘
                   │ Git Push
                   ▼
┌───────────────────────────────────────┐
│        GitHub Pages Web App           │
│   https://kylebur.github.io/          │
│   - Fetches live_data.json            │
│   - Displays Live River Temp & Tide   │
│   - Plots Measured vs Predicted Tides │
└───────────────────────────────────────┘
```

---

## 2. Prerequisites

1. **Home Assistant Long-Lived Access Token**:
   - In Home Assistant, click on your **Profile** (bottom left).
   - Scroll down to **Long-Lived Access Tokens**.
   - Click **Create Token**, name it `Newcastle Weather App`, and copy the token.

2. **Entity IDs in Home Assistant**:
   - Water Temperature: e.g. `sensor.damariscotta_river_temperature` (or your Zigbee MQTT sensor entity)
   - Measured Tide: e.g. `sensor.measured_tide_height` (or your tide level sensor entity)

3. **Git Push Credentials**:
   - Ensure the machine running the cron job can push to GitHub (either via SSH deploy key or GitHub Personal Access Token configured in git credential store).

---

## 3. Configuration

Create `ha_config.json` in the root of the repository (or copy from `ha_config.sample.json`):

```json
{
  "ha_url": "http://homeassistant.local:8123",
  "ha_token": "YOUR_LONG_LIVED_ACCESS_TOKEN",
  "water_temp_entity": "sensor.damariscotta_river_temperature",
  "measured_tide_entity": "sensor.measured_tide_height",
  "output_file": "live_data.json",
  "history_hours": 48,
  "git_push": true,
  "git_remote": "origin",
  "git_branch": "main"
}
```
*(Note: `ha_config.json` is automatically ignored in `.gitignore` so your private token is never committed).*

---

## 4. Test the Sync Script Manually

Run a dry run first to verify communication with Home Assistant:

```bash
python3 scripts/sync_homeassistant.py --dry-run
```

Run a live write (without pushing):

```bash
python3 scripts/sync_homeassistant.py --no-push
```

Run the full sync with git commit and push:

```bash
python3 scripts/sync_homeassistant.py
```

---

## 5. Setting Up the Cron Job (Every 30 Minutes)

### Option A: Standard Crontab (Raspberry Pi, Linux Server, macOS)

Open the crontab editor:

```bash
crontab -e
```

Add the following line to run every 30 minutes on the hour and half-hour:

```cron
*/30 * * * * /Users/kyle/Documents/apps/03-01-2026-weather/scripts/sync_homeassistant.sh >> /tmp/weather_sync.log 2>&1
```

*(Adjust the path to match the directory where the repository is cloned on your system).*

---

### Option B: Home Assistant Automation (Directly within Home Assistant OS)

If you prefer Home Assistant to initiate the sync:

1. Add a shell command in `configuration.yaml`:
   ```yaml
   shell_command:
     sync_weather_github: "python3 /config/custom_scripts/sync_homeassistant.py"
   ```

2. Add a Home Assistant automation:
   ```yaml
   alias: "Sync River Temp & Tide to GitHub Every 30 Mins"
   trigger:
     - platform: time_pattern
       minutes: "/30"
   action:
     - service: shell_command.sync_weather_github
   ```

---

## 6. Web App Behavior

- The web app automatically fetches `live_data.json` on initial load and polls for updates every 2 minutes.
- **River Water Temperature** is shown in the top header with a water wave icon.
- **Measured Tide** is displayed in the header with live trend indicators (▲ rising, ▼ falling).
- **Tide Chart**: When measured tide data points are present in `live_data.json`, they are plotted directly on the 29-day tide graph as an accented green/cyan dotted curve with data point dots, allowing easy visual comparison against harmonic predictions.
- **Offline & Graceful Fallback**: If `live_data.json` is unavailable or delayed, the app seamlessly falls back to pure harmonic tide predictions and NOAA/NWS weather models.
