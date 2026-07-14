# Hyderabad Metro Smart Travel Assistant

A fully client-side Progressive Web App that helps Hyderabad Metro commuters track journeys, receive smart alerts, and log completed trips for offline insights.

## Features

- 📍 Live geolocation tracking with optional background worker fallback
- 🪟 One-tap video Picture-in-Picture journey card with current station, next station, remaining stops, line, and ETA
- 🕐 Official HMRL GTFS next departures, station platforms, first/last trains, and fare lookup
- 🚇 Schedule-derived network movement estimates with explicit source and freshness labels
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
│       ├── metro_lines.json
│       └── metro_schedule.json
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

The `public/assets/hyderabad_metro_stations.json` file is generated from the supplied GTFS `stops.txt` to include top-level station coordinates. Route geometry, scheduled trips, platforms, official line colors, and fares are generated from the files under `GTFS_DATA`. Rebuild and verify the derived data after a GTFS update:

```pwsh
npm run generate:data
npm run verify:data
```

## PWA considerations

- The service worker precaches the landing page, manifest, and station metadata, and dynamically caches bundled assets on first use.
- Timetables, platforms, fares, and official Red/Green/Blue line colors come from the HMRL Open Data GTFS snapshot. The required attribution is displayed in the Trains view.
- HMRL does not currently publish a public real-time vehicle-position, trip-update, or incident feed. Train positions are therefore labeled timetable estimates; rider progress is the separate device-GPS feature.
- Notifications rely on explicit user permission. The app gracefully degrades when permissions are denied or unavailable.
- Background tracking uses a worker when supported, with a main-thread fallback otherwise.
- The **Float over apps** control uses video Picture-in-Picture. On compatible Android browsers it can remain above other apps; unsupported browsers keep the in-app journey island and ongoing notification as fallbacks.
- Mobile operating systems can pause browser geolocation after the PWA is backgrounded. The overlay always shows the latest known station, while fully continuous background GPS would require a native Android foreground service.

## Icons

The app uses the supplied `hmr-logo.jpeg` artwork throughout the header, favicon, install manifest, offline cache, and journey notifications. The deployable copy lives at `public/icons/hmr-logo.jpeg`.
