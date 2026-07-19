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
| `test/verify-math.js` | Verifies the break formula against expected values |
| `tools/calibrate.js` | Turns logged reads into multiplier recommendations |
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

## Verifying the math

```
npm test
```

Loads the real `app.js` into a mock-DOM sandbox and exercises the actual
`calculate()` / `calculateDb()` functions — it tests the shipped code, not a
copy of it. No dependencies required.

It covers ~9,700 input combinations (distance × slope × hill × green speed ×
grain × cup low × capture speed), checking break inches and entry angle against
independently derived values, plus:

- monotonicity (more slope / faster greens → more break; zero slope → zero break)
- downhill > flat > uphill, die > normal > firm, against > across > with
- proximity reduction applies inside 15 ft only; center cup never reduced
- the 30% break cap
- aim direction (left-low → aim right, right-low → aim left, center → aim above)
- double breaker: same-direction stacking, S-curve netting, S2 inflection weight
- practice-round exports re-totaled independently

**Run this after any formula change.** Current status: 19,470 / 19,470 passing.

## Calibrating against real putts

The tests prove the code computes what the formula *specifies*. They cannot
prove the multipliers themselves (stimp values, the 0.70/1.35 hill factors, the
2.7 ft/step stride) match reality — that takes on-course data.

**Collecting it:** take a read as normal, hit the putt, then under
**Read Accuracy** record whether it broke MORE (missed low), LESS (missed high),
or was dead on — and by how many cup widths (1 cup ≈ 4.25").

**Getting it off the phone:** open the scorecard → **Export** → **📤 Save /
Share**. On iOS that opens the share sheet, so you can AirDrop it to a computer,
save to Files, or mail it to yourself. Elsewhere it downloads as
`caddie-round-YYYY-MM-DD.json`.

**Analyzing it:**

```
npm run calibrate -- path/to/export.json
```

It reports overall bias and a per-condition breakdown, suggesting concrete new
multiplier values where a condition is consistently off.

Notes:

- Aim for **20+ reads overall** and **5+ per condition** before changing anything.
- **Log the dead-on reads too.** They set the baseline the other numbers are
  measured against. In testing, a sample with 67% pure reads recovered a known
  bias as 1.237 (truth 1.25); a sample with few pure reads recovered the same
  bias as only 1.215, because the bias dragged the baseline it was compared to.
- A uniform bias across *all* conditions usually means your stride (2.7 ft/step)
  or the `/2` divisor is off — not the individual multipliers.
- Calibration is **iterative**. When one factor carries the bias, it also drags
  the overall median, so a single pass slightly under-corrects. Apply a change,
  collect another round, and re-run to converge.
- Change one multiplier at a time, then run `npm test` to confirm nothing broke.

## Updating the app

The service worker caches the app shell. After pushing changes, bump
`CACHE_VERSION` in `service-worker.js` so installed devices pick up the new
version on next launch.
