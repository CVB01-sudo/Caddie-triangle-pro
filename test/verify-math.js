// Headless verification of Caddie Triangle Pro's real math.
// Loads the actual app.js into a mock-DOM sandbox, exercises calculate() and
// calculateDb() across an input grid, and checks each result against an
// independently derived expected value + behavioral invariants.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = process.argv[2] || '.';
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// ---------- mock DOM ----------
const elCache = {};
function ctxProxy() {
  return new Proxy({}, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (typeof p === 'symbol') return undefined;
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const CTX = ctxProxy();
function makeEl() {
  const backing = { className: '', innerHTML: '', textContent: '', value: '', width: 0, height: 0 };
  return new Proxy(backing, {
    get(t, p) {
      if (p === 'style') return t.__style || (t.__style = new Proxy({}, { get: (s, k) => (s[k] !== undefined ? s[k] : ''), set: (s, k, v) => { s[k] = v; return true; } }));
      if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (p === 'parentElement') return { clientWidth: 400, clientHeight: 220, querySelectorAll: () => [] };
      if (p === 'getContext') return () => CTX;
      if (p === 'querySelectorAll') return () => [];
      if (p === 'querySelector') return () => null;
      if (p === 'focus' || p === 'appendChild' || p === 'scrollIntoView' || p === 'addEventListener') return () => {};
      if (p in t) return t[p];
      return undefined;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const documentMock = {
  getElementById(id) { return elCache[id] || (elCache[id] = makeEl()); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener() {},
};
const sandbox = {
  document: documentMock,
  window: { devicePixelRatio: 1, addEventListener() {} },
  navigator: { clipboard: { writeText() {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  console,
  Math, Date, JSON, Array, Object, parseInt, parseFloat, isNaN,
  setTimeout: () => {}, clearTimeout: () => {},
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

const epilogue = `;globalThis.__hooks = { state, dbState, slopeMap, speedMap, hillMap, grainMap, speedIntentMap, proximityReduction, fmtBreak, calculate, calculateDb, selCalPart, resetCalibrationUI, CUP_INCHES };`;
vm.createContext(sandbox);
vm.runInContext(appSrc + epilogue, sandbox, { filename: 'app.js' });
const H = sandbox.__hooks;
const { state, dbState, slopeMap, speedMap, hillMap, grainMap, speedIntentMap, proximityReduction } = H;

// ---------- parse helpers ----------
function parseSingle() {
  const html = documentMock.getElementById('resultCard').innerHTML;
  const label = (html.match(/result-break-label">([^<]*)</) || [])[1] || '';
  let breakIn;
  let m = label.match(/\(([\d.]+)"?\)/);         // "<ft>' (<in>")" form  (breakIn < 12)
  if (m) breakIn = parseFloat(m[1]);
  else { m = label.match(/([\d.]+)"\s*total/); if (m) breakIn = parseFloat(m[1]); } // ">=12" form
  const meta = (html.match(/result-header-meta">([^<]*)</) || [])[1] || '';
  const mm = meta.match(/([\d.]+) ft · ([\d.]+)% slope/);
  const distFt = mm ? parseFloat(mm[1]) : null;
  const stats = [...html.matchAll(/result-stat-val[^>]*>([^<]*)</g)].map(x => x[1]);
  const entryAngle = parseFloat(stats[0]);       // "12.3°"
  const dir = (html.match(/result-break-dir">([^<]*)</) || [])[1] || '';
  const aim = (html.match(/result-direction">([^<]*)</) || [])[1] || '';
  return { breakIn, distFt, entryAngle, dir, aim, html };
}
function invFmt(str) {
  str = str.trim();
  if (str.includes("'")) {
    const [f, rest] = str.split("'");
    const inch = rest && rest.replace('"', '').trim() ? parseFloat(rest) : 0;
    return parseInt(f, 10) * 12 + inch;
  }
  return parseFloat(str.replace('"', ''));
}

// ---------- expected (documented) formulas ----------
const r1 = x => Math.round(x * 10) / 10;
function expectedBreak(steps, slope, hill, speed, grain, cup, intent) {
  const distFt = steps * 2.7;
  const raw = distFt * (slopeMap[slope] / 2) * speedMap[speed] * hillMap[hill] * grainMap[grain];
  const red = proximityReduction(distFt, cup);
  let adj = raw * (1 - red) * (speedIntentMap[intent] || 1);
  adj = Math.min(adj, distFt * 12 * 0.30);
  return { breakIn: r1(adj), entryAngle: r1(Math.atan2(adj / 12, distFt) * 180 / Math.PI), distFt: r1(distFt), red };
}

// ---------- run ----------
let pass = 0, fail = 0; const fails = [];
function check(name, cond, detail) { if (cond) pass++; else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); } }

function runSingle(steps, slope, hill, speed, grain, cup, intent) {
  Object.assign(state, { steps, slope, hill, speed, grain, cup, speedIntent: intent });
  H.calculate();
  return parseSingle();
}

// 1) EXACT formula match across a grid
const slopes = ['zero', 'low', 'mod', 'strong', 'severe'];
const hills = ['up', 'flat', 'down'];
const speeds = ['slow', 'med', 'fast', 'tour'];
const grains = ['with', 'across', 'against'];
const cups = ['left', 'center', 'right'];
const intents = ['die', 'normal', 'firm'];
const stepSet = [2, 3.5, 5, 8, 12, 20];
let gridN = 0;
for (const steps of stepSet)
  for (const slope of slopes)
    for (const hill of hills)
      for (const speed of speeds)
        for (const grain of grains)
          for (const cup of cups)
            for (const intent of intents) {
              gridN++;
              const got = runSingle(steps, slope, hill, speed, grain, cup, intent);
              const exp = expectedBreak(steps, slope, hill, speed, grain, cup, intent);
              const okBreak = Number.isFinite(got.breakIn) && Math.abs(got.breakIn - exp.breakIn) <= 0.05;
              check(`break ${steps}s/${slope}/${hill}/${speed}/${grain}/${cup}/${intent}`, okBreak, `app=${got.breakIn} exp=${exp.breakIn}`);
              const okAngle = Number.isFinite(got.entryAngle) && Math.abs(got.entryAngle - exp.entryAngle) <= 0.15;
              check(`angle ${steps}s/${slope}/${hill}/${speed}`, okAngle, `app=${got.entryAngle} exp=${exp.entryAngle}`);
            }

// 2) BEHAVIORAL invariants
// more slope -> more break
{
  const base = (sl) => runSingle(8, sl, 'flat', 'med', 'across', 'left', 'normal').breakIn;
  check('slope monotonic', base('zero') < base('low') && base('low') < base('mod') && base('mod') < base('strong') && base('strong') < base('severe'),
        `${base('zero')},${base('low')},${base('mod')},${base('strong')},${base('severe')}`);
  check('zero slope => zero break', base('zero') === 0, 'got ' + base('zero'));
}
// downhill breaks more than flat than uphill
{
  const b = (h) => runSingle(8, 'mod', h, 'med', 'across', 'left', 'normal').breakIn;
  check('down > flat > up', b('down') > b('flat') && b('flat') > b('up'), `${b('up')}/${b('flat')}/${b('down')}`);
}
// faster green breaks more
{
  const b = (s) => runSingle(8, 'mod', 'flat', s, 'across', 'left', 'normal').breakIn;
  check('speed monotonic', b('slow') < b('med') && b('med') < b('fast') && b('fast') < b('tour'), `${b('slow')}/${b('med')}/${b('fast')}/${b('tour')}`);
}
// die amplifies, firm reduces
{
  const b = (i) => runSingle(8, 'mod', 'flat', 'med', 'across', 'left', i).breakIn;
  check('die > normal > firm', b('die') > b('normal') && b('normal') > b('firm'), `${b('die')}/${b('normal')}/${b('firm')}`);
}
// grain: against > across > with
{
  const b = (g) => runSingle(8, 'mod', 'flat', 'med', g, 'left', 'normal').breakIn;
  check('grain against>across>with', b('against') > b('across') && b('across') > b('with'), `${b('with')}/${b('across')}/${b('against')}`);
}
// proximity reduction only inside 15ft, none beyond; center cup never reduced
{
  const near = expectedBreak(3.5, 'mod', 'flat', 'med', 'across', 'left', 'normal'); // 9.45 ft -> 0.25
  const far = expectedBreak(8, 'mod', 'flat', 'med', 'across', 'left', 'normal');    // 21.6 ft -> 0
  check('proximity applies near (<15ft)', near.red === 0.25, 'red=' + near.red);
  check('no proximity far (>15ft)', far.red === 0, 'red=' + far.red);
  check('center cup no proximity', proximityReduction(9, 'center') === 0);
}
// direction / aim wording
{
  const L = runSingle(8, 'mod', 'flat', 'med', 'across', 'left', 'normal');
  const R = runSingle(8, 'mod', 'flat', 'med', 'across', 'right', 'normal');
  const C = runSingle(8, 'mod', 'flat', 'med', 'across', 'center', 'normal');
  check('left low => aim RIGHT', /RIGHT of cup/.test(L.aim) && /Right → Left/.test(L.dir), L.aim + ' | ' + L.dir);
  check('right low => aim LEFT', /LEFT of cup/.test(R.aim) && /Left → Right/.test(R.dir), R.aim + ' | ' + R.dir);
  check('center => aim above/center', /center/.test(C.aim) && /center fall line/.test(C.dir), C.aim + ' | ' + C.dir);
}
// 30% distance cap: severe slope, tour speed, downhill, against, die -> must be capped
{
  const steps = 20, distFt = steps * 2.7;
  const got = runSingle(steps, 'severe', 'down', 'tour', 'against', 'left', 'die');
  const cap = r1(distFt * 12 * 0.30);
  check('30% break cap enforced', Math.abs(got.breakIn - cap) < 0.05, `app=${got.breakIn} cap=${cap}`);
}

// 3) DOUBLE BREAKER
function runDb(steps, s1steps, s1, s2) {
  Object.assign(state, { steps, slope: 'mod', hill: 'flat', speed: 'med', grain: 'across', cup: 'left', speedIntent: 'normal' });
  Object.assign(dbState, { active: true, s1steps,
    s1slope: s1.slope, s1hill: s1.hill, s1cup: s1.cup,
    s2slope: s2.slope, s2hill: s2.hill, s2cup: s2.cup });
  H.calculateDb();
  const html = documentMock.getElementById('dbResultCard').innerHTML;
  const total = invFmt((html.match(/result-break">([^<]*)</) || [])[1] || '0');
  const dir = (html.match(/result-break-dir">([^<]*)</) || [])[1] || '';
  return { total, dir, html };
}
function expectedDb(steps, s1steps, s1, s2) {
  const total = steps, s2steps = Math.max(0.5, total - s1steps);
  const s1ft = s1steps * 2.7, s2ft = s2steps * 2.7;
  const speedM = speedMap['med'], grainM = grainMap['across'], intentM = 1;
  const s1raw = s1ft * (slopeMap[s1.slope] / 2) * speedM * hillMap[s1.hill] * grainM;
  const s1break = s1raw * (1 - proximityReduction(s1ft, s1.cup));
  const ratio = s1steps / total, w = 1 + ratio * 0.2;
  const s2raw = s2ft * (slopeMap[s2.slope] / 2) * speedM * hillMap[s2.hill] * grainM;
  const s2break = s2raw * (1 - proximityReduction(s2ft, s2.cup)) * w * intentM;
  const d1 = s1.cup === 'left' ? 'R' : s1.cup === 'right' ? 'L' : 'C';
  const d2 = s2.cup === 'left' ? 'R' : s2.cup === 'right' ? 'L' : 'C';
  const same = d1 === d2 || d1 === 'C' || d2 === 'C';
  let tot = same ? s1break + s2break : Math.max(0, s2break - s1break * 0.5);
  tot = Math.min(tot, total * 2.7 * 12 * 0.30);
  return r1(tot);
}
const dbCases = [
  [10, 4, { slope: 'mod', hill: 'flat', cup: 'left' }, { slope: 'strong', hill: 'flat', cup: 'left' }],   // stack (same dir)
  [10, 5, { slope: 'strong', hill: 'flat', cup: 'left' }, { slope: 'strong', hill: 'flat', cup: 'right' }],// S-curve (oppose)
  [12, 6, { slope: 'low', hill: 'up', cup: 'center' }, { slope: 'mod', hill: 'down', cup: 'right' }],       // one straight
  [8, 3, { slope: 'mod', hill: 'flat', cup: 'right' }, { slope: 'severe', hill: 'down', cup: 'right' }],    // stack right
];
for (const [st, s1s, a, b] of dbCases) {
  const got = runDb(st, s1s, a, b);
  const exp = expectedDb(st, s1s, a, b);
  check(`DB total ${st}/${s1s}`, Math.abs(got.total - exp) <= 0.15, `app=${got.total} exp=${exp} (${got.dir})`);
}
// S-curve nets below a same-direction stack of identical magnitudes
{
  const stack = runDb(10, 5, { slope: 'strong', hill: 'flat', cup: 'left' }, { slope: 'strong', hill: 'flat', cup: 'left' }).total;
  const scurve = runDb(10, 5, { slope: 'strong', hill: 'flat', cup: 'left' }, { slope: 'strong', hill: 'flat', cup: 'right' }).total;
  check('S-curve nets < same-dir stack', scurve < stack, `scurve=${scurve} stack=${stack}`);
}

// 4) CALIBRATION capture — actual break derived from cup-width error
{
  const CUP = H.CUP_INCHES;
  const chip = () => makeEl();
  const freshRead = (...a) => { runSingle(...a); return parseSingle().breakIn; };

  const predicted = freshRead(8, 'mod', 'flat', 'med', 'across', 'left', 'normal');
  state.calibrations.length = 0;
  H.resetCalibrationUI();

  // under-read (missed low) => broke MORE than predicted
  H.selCalPart('dir', 'under', chip());
  H.selCalPart('cups', 1, chip());
  let e = state.calibrations[0];
  check('cal: under 1 cup => +4.25"', e && Math.abs(e.actualBreak - (predicted + CUP)) < 0.06, e && `${e.actualBreak} vs ${predicted + CUP}`);
  check('cal: one entry logged', state.calibrations.length === 1, 'n=' + state.calibrations.length);
  check('cal: captures conditions', e && e.slope === 'mod' && e.hill === 'flat' && e.predictedBreak === predicted, JSON.stringify(e && { s: e.slope, h: e.hill, p: e.predictedBreak }));

  // editing the magnitude overwrites instead of duplicating
  H.selCalPart('cups', 2, chip());
  check('cal: edit overwrites (no dup)', state.calibrations.length === 1 && Math.abs(state.calibrations[0].actualBreak - (predicted + 2 * CUP)) < 0.06,
        'n=' + state.calibrations.length + ' v=' + state.calibrations[0].actualBreak);

  // over-read (missed high) => broke LESS
  H.resetCalibrationUI();
  H.selCalPart('dir', 'over', chip());
  H.selCalPart('cups', 1, chip());
  e = state.calibrations[1];
  check('cal: over 1 cup => −4.25"', e && Math.abs(e.actualBreak - (predicted - CUP)) < 0.06, e && `${e.actualBreak} vs ${predicted - CUP}`);

  // dead-on => actual equals predicted, logs immediately with no magnitude
  H.resetCalibrationUI();
  H.selCalPart('dir', 'pure', chip());
  e = state.calibrations[2];
  check('cal: pure => actual == predicted', e && Math.abs(e.actualBreak - predicted) < 0.06, e && `${e.actualBreak} vs ${predicted}`);

  // actual break can never go negative on a big over-read of a tiny break
  const tiny = freshRead(2, 'p5', 'up', 'slow', 'with', 'left', 'firm');
  H.resetCalibrationUI();
  H.selCalPart('dir', 'over', chip());
  H.selCalPart('cups', 3, chip());
  e = state.calibrations[state.calibrations.length - 1];
  check('cal: never negative', e && e.actualBreak >= 0, `tiny=${tiny} actual=${e && e.actualBreak}`);

  state.calibrations.length = 0;
}

// 5) PRACTICE-ROUND export aggregation (independent re-total)
const dataDir = path.join(ROOT, 'Practice Round Data');
for (const f of fs.readdirSync(dataDir).filter(x => x.endsWith('.md'))) {
  const raw = fs.readFileSync(path.join(dataDir, f), 'utf8');
  const j = JSON.parse(raw);
  const p = j.player1, holes = p.holes;
  const total = holes.reduce((a, h) => a + h.putts, 0);
  const ones = holes.filter(h => h.putts === 1).length;
  const threes = holes.filter(h => h.putts >= 3).length;
  const avg = +(total / holes.length).toFixed(2);
  check(`${f}: totalPutts`, total === p.totalPutts, `calc=${total} file=${p.totalPutts}`);
  check(`${f}: onePutts`, ones === p.onePutts, `calc=${ones} file=${p.onePutts}`);
  check(`${f}: threePutts`, threes === p.threePutts, `calc=${threes} file=${p.threePutts}`);
  check(`${f}: avg`, Math.abs(avg - p.avg) <= 0.01, `calc=${avg} file=${p.avg}`);
}

// ---------- report ----------
console.log('\n=== Caddie Triangle Pro — Math Verification ===\n');
console.log(`Grid cases exercised (single-putt): ${gridN}`);
console.log(`Total assertions: ${pass + fail}`);
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fails.length) { console.log('\nFailures:'); fails.forEach(f => console.log('  ✗ ' + f)); }
else console.log('\n✅ All checks passed.');

// sample readouts for eyeballing
console.log('\n--- Sample reads (for sanity) ---');
const samples = [
  [8, 'mod', 'flat', 'med', 'across', 'left', 'normal'],
  [3, 'strong', 'down', 'fast', 'against', 'right', 'die'],
  [12, 'low', 'up', 'slow', 'with', 'center', 'firm'],
  [15, 'severe', 'down', 'tour', 'against', 'left', 'die'],
];
for (const s of samples) {
  const g = runSingle(...s);
  console.log(`${s[0]}steps(${g.distFt}ft) ${s[1]}/${s[2]}/${s[3]}/${s[4]}/cup-${s[5]}/${s[6]}  ->  break ${g.breakIn}"  |  ${g.aim}  |  entry ${g.entryAngle}°`);
}
process.exit(fail ? 1 : 0);
