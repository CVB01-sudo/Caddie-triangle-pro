# Caddie Triangle Pro

A green-reading caddie web app: triangle putt reads, a break calculator, a
double-breaker mode, and a putting scorecard with round insights. Runs entirely
in the browser — no backend, data is stored locally on the device.

## Files

| File | What it is |
|---|---|
| `index.html` | Markup / app structure |
| `styles.css` | All styles |
| `app.js` | App logic (break formula, triangle canvas, scorecard, player 2, storage) |
| `manifest.json` | PWA manifest (name, icons, theme color) |
| `service-worker.js` | Offline caching so the app works with no signal |
| `icon-*.png`, `apple-touch-icon.png`, `favicon.png` | App / home-screen icons |
| `caddie-triangle-pro.html` | Original single-file version (kept for reference) |

## Run it

Open `index.html` in a browser. The core app works from a local file, but the
**PWA features (offline + Add to Home Screen) require HTTPS** — a service worker
will not register from `file://`. Use GitHub Pages (below) or any HTTPS host.

## Deploy on GitHub Pages

1. Repo **Settings → Pages** → Source: **Deploy from a branch** → `main` / `/ (root)` → **Save**.
2. Wait ~1 minute. The app goes live at:
   `https://cvb01-sudo.github.io/Caddie-triangle-pro/`

All manifest/service-worker paths are relative, so it works correctly under that
subpath.

## Install on iPhone

1. Open the GitHub Pages URL above in **Safari** (not Chrome — iOS install only
   works from Safari).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch it from the home screen. It opens full-screen (no browser bars) with
   the flag icon, and works offline after the first load.

To install on **Android**, open the URL in Chrome and use **⋮ → Install app /
Add to Home screen**. On **desktop** Chrome/Edge, use the install icon in the
address bar.

## Updating the app

The service worker caches the app shell. After pushing changes, bump
`CACHE_VERSION` in `service-worker.js` so installed devices pick up the new
version on next launch.
