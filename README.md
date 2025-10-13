# Hyderabad Metro Smart Travel Assistant

A fully client-side Progressive Web App that helps Hyderabad Metro commuters track journeys, receive smart alerts, and log completed trips for offline insights.

## Features

- 📍 Live geolocation tracking with optional background worker fallback
- 🚉 Destination and next-stop alerts with sound, vibration, and persistent notifications
- 🔕 Customisable alarm distance, notification sound, and theme preferences stored locally
- 📦 Offline-first service worker caching of core assets and station metadata
- 💾 IndexedDB (via Dexie) for trip history, preferences, and station cache
- 🧠 Smart ETA predictions based on historical averages and distance heuristics
- 📜 Trip history view with duration and distance summaries
- 🔁 Offline simulation mode if live GPS becomes unavailable

## Project structure

```
hyderabad-metro-smart-travel/
├── index.html
├── package.json
├── public/
│   ├── manifest.json
│   ├── service-worker.js
│   └── assets/
│       ├── hyderabad_metro_stations.json
│       └── metro_lines.json
├── scripts/
│   └── generate-lines.js
└── src/
    ├── App.jsx
    ├── main.jsx
    ├── components/
    ├── db/
    ├── hooks/
    ├── services/
    ├── styles/
    ├── utils/
    └── workers/
```

## Getting started

1. Install dependencies:

   ```pwsh
   npm install
   ```

2. Run the development server:

   ```pwsh
   npm run dev
   ```

3. Build a production bundle:

   ```pwsh
   npm run build
   npm run preview
   ```

## Data preparation

The `public/assets/hyderabad_metro_stations.json` file is generated from the supplied GTFS `stops.txt` to include top-level station coordinates. `public/assets/metro_lines.json` contains ordered station sequences per route/direction and is produced via `scripts/generate-lines.js`. Re-run the script after GTFS updates:

```pwsh
node scripts/generate-lines.js
```

## PWA considerations

- The service worker precaches the landing page, manifest, and station metadata, and dynamically caches bundled assets on first use.
- Notifications rely on explicit user permission. The app gracefully degrades when permissions are denied or unavailable.
- Background tracking uses a worker when supported, with a main-thread fallback otherwise.

## Icons

Placeholder icon paths are referenced in `manifest.json`. Replace `/public/icons/icon-192.png` and `/public/icons/icon-512.png` with brand-safe PNG assets before distribution.
