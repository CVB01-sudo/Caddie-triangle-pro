// Calibration analyzer for Caddie Triangle Pro.
//
// Reads one or more round exports (the JSON the app's Export button produces)
// and compares the predicted break against what the putt actually did, then
// suggests how each formula multiplier should move.
//
//   node tools/calibrate.js <file-or-folder> [...more]
//   npm run calibrate -- "Practice Round Data"
//
// Ratio = actualBreak / predictedBreak
//   > 1.00  the app UNDER-predicts break (putts break more than it says)
//   < 1.00  the app OVER-predicts break
const fs = require('fs');
const path = require('path');

const MIN_PREDICTED = 0.5;   // ignore near-zero reads (ratio explodes)
const MIN_SAMPLES = 5;       // per-bucket threshold before suggesting a change
const GOOD_SAMPLE = 20;      // overall reads before trusting the global number

// ---- current multipliers, parsed straight out of app.js so they stay in sync
function currentMaps(root) {
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const grab = (name) => {
    const m = src.match(new RegExp('const ' + name + '\\s*=\\s*(\\{[^}]*\\})'));
    return m ? Function('return ' + m[1])() : null;
  };
  return {
    slope: grab('slopeMap'), speed: grab('speedMap'), hill: grab('hillMap'),
    grain: grab('grainMap'), speedIntent: grab('speedIntentMap'),
  };
}

// ---- gather observations
function collect(targets) {
  const files = [];
  for (const t of targets) {
    const st = fs.existsSync(t) ? fs.statSync(t) : null;
    if (!st) { console.warn('skip (not found): ' + t); continue; }
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(t)) {
        if (/\.(json|md|txt)$/i.test(f)) files.push(path.join(t, f));
      }
    } else files.push(t);
  }
  const obs = [];
  let filesWithData = 0;
  for (const f of files) {
    let j;
    try { j = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { continue; } // not a round export
    const cal = j.calibration || j.calibrations;
    if (Array.isArray(cal) && cal.length) {
      filesWithData++;
      for (const c of cal) obs.push(Object.assign({ _file: path.basename(f) }, c));
    }
  }
  return { obs, files, filesWithData };
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (r) => ((r - 1) * 100).toFixed(1).replace(/^-/, '−') + '%';

function bucketDistance(ft) {
  if (ft <= 6) return '≤6 ft';
  if (ft <= 10) return '7–10 ft';
  if (ft <= 15) return '11–15 ft';
  if (ft <= 30) return '16–30 ft';
  return '>30 ft';
}

// ---- main
const args = process.argv.slice(2);
const ROOT = process.env.CADDIE_ROOT || '.';
const targets = args.length ? args : ['.'];
const { obs, files, filesWithData } = collect(targets);

console.log('\n=== Caddie Triangle Pro — Read Calibration ===\n');
console.log('Files scanned: ' + files.length + '   |   with calibration data: ' + filesWithData);

if (!obs.length) {
  console.log('\nNo calibration data found yet.\n');
  console.log('How to collect it:');
  console.log('  1. Take a read in the app as normal.');
  console.log('  2. Hit the putt, then under "Read Accuracy" record whether it broke');
  console.log('     MORE (missed low), LESS (missed high), or was dead on — and by how');
  console.log('     many cup widths.');
  console.log('  3. Tap Export on the scorecard and save the JSON into a file.');
  console.log('  4. Re-run: npm run calibrate -- <that-file-or-folder>\n');
  console.log('Aim for ' + GOOD_SAMPLE + '+ reads overall, and ' + MIN_SAMPLES + '+ per condition, before trusting a change.\n');
  process.exit(0);
}

const usable = obs.filter(o => typeof o.predictedBreak === 'number' &&
                               typeof o.actualBreak === 'number' &&
                               o.predictedBreak >= MIN_PREDICTED);
const ratios = usable.map(o => o.actualBreak / o.predictedBreak);
const gMed = median(ratios), gMean = mean(ratios);

console.log('Reads logged: ' + obs.length + '   |   usable (predicted ≥ ' + MIN_PREDICTED + '"): ' + usable.length);
console.log('\n--- Overall bias ---');
console.log('  median ratio : ' + gMed.toFixed(3) + '   (' + pct(gMed) + ' vs predicted)');
console.log('  mean   ratio : ' + gMean.toFixed(3));
const dead = usable.filter(o => o.readError === 'pure').length;
console.log('  dead-on reads: ' + dead + ' / ' + usable.length +
            ' (' + Math.round(dead / usable.length * 100) + '%)');

if (usable.length < GOOD_SAMPLE) {
  console.log('\n  ⚠ Only ' + usable.length + ' reads — treat everything below as provisional.');
  console.log('    Collect ' + GOOD_SAMPLE + '+ before changing any multiplier.');
}
if (Math.abs(gMed - 1) > 0.05) {
  const dir = gMed > 1 ? 'UNDER-predicting' : 'OVER-predicting';
  console.log('\n  → The app is ' + dir + ' break by about ' + pct(gMed) + ' across the board.');
  console.log('    A uniform bias like this usually means the step length (2.7 ft/step)');
  console.log('    or the /2 divisor in the core formula needs adjusting — not the');
  console.log('    individual condition multipliers.');
  const stepSuggest = (2.7 * gMed).toFixed(2);
  console.log('    If it is your stride: 2.7 → ~' + stepSuggest + ' ft/step would absorb it.');
}

// ---- per-factor breakdown
const maps = currentMaps(ROOT);
const factors = [
  ['slope', 'slope', maps.slope],
  ['hill', 'hill', maps.hill],
  ['speed', 'speed', maps.speed],
  ['grain', 'grain', maps.grain],
  ['speedIntent', 'capture speed', maps.speedIntent],
  ['cup', 'cup low point', null],
];

console.log('\n--- By condition (relative to overall bias) ---');
console.log('  A value above 1.00 means that condition breaks MORE than the app expects.\n');
for (const [key, label, map] of factors) {
  const groups = {};
  for (const o of usable) {
    const v = o[key];
    if (v == null) continue;
    (groups[v] = groups[v] || []).push(o.actualBreak / o.predictedBreak);
  }
  const keys = Object.keys(groups);
  if (!keys.length) continue;
  console.log('  ' + label.toUpperCase());
  for (const k of keys) {
    const arr = groups[k], m = median(arr), rel = m / gMed;
    let line = '    ' + k.padEnd(10) + ' n=' + String(arr.length).padStart(3) +
               '  ratio ' + m.toFixed(3) + '  rel ' + rel.toFixed(3);
    if (arr.length < MIN_SAMPLES) line += '   (need ' + MIN_SAMPLES + '+)';
    else if (map && map[k] != null && Math.abs(rel - 1) > 0.07) {
      line += '   → ' + map[k] + ' → ' + (map[k] * rel).toFixed(3);
    } else if (Math.abs(rel - 1) <= 0.07) line += '   ✓ in range';
    console.log(line);
  }
  console.log('');
}

// ---- distance buckets (checks the proximity model)
console.log('  DISTANCE (tests the proximity/fall-line reduction)');
{
  const groups = {};
  for (const o of usable) {
    const b = bucketDistance(o.distFt);
    (groups[b] = groups[b] || []).push(o.actualBreak / o.predictedBreak);
  }
  for (const b of ['≤6 ft', '7–10 ft', '11–15 ft', '16–30 ft', '>30 ft']) {
    if (!groups[b]) continue;
    const arr = groups[b], m = median(arr), rel = m / gMed;
    let line = '    ' + b.padEnd(10) + ' n=' + String(arr.length).padStart(3) +
               '  ratio ' + m.toFixed(3) + '  rel ' + rel.toFixed(3);
    if (arr.length < MIN_SAMPLES) line += '   (need ' + MIN_SAMPLES + '+)';
    else if (Math.abs(rel - 1) > 0.07) line += '   ← proximity reduction may be off here';
    else line += '   ✓ in range';
    console.log(line);
  }
}

console.log('\n--- How to apply ---');
console.log('  Change one multiplier at a time in app.js, then re-run:  npm test');
console.log('  That confirms the formula still behaves correctly after the edit.\n');
