# Project Mandates

- All changes must be added, committed, and pushed to GitHub.

# Deployment

The Newcastle Weather application is deployed to GitHub Pages.
URL: https://kylebur.github.io/newcastleweather/

# Tide Calculations

Tide calculations must be computed locally using the harmonic constituents defined in constituents.md. Always refer to constituents.md and update the tide prediction logic in index.html and App.jsx if new or more detailed constituents are provided there.

# Version Tracking

The current application version is displayed on the bottom right of the web interface. With each prompt/change, increment the version number (using semantic versioning format `vX.Y.Z`) in:
- `GEMINI.md` (this directive)
- `index.html` (UI version label)
- `App.jsx` (UI version label)

Current version: v1.3.2
