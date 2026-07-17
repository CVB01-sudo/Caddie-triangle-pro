const STORAGE_KEY = 'caddie_triangle_pro';

const state = {
  steps:8, slope:null, hill:null, speed:null, speedIntent:'normal', grain:null, cup:null,
  currentHole:1,
  // Player 1 — CVB (always active)
  scores:Array(18).fill(null), distances:Array(18).fill(null), misses:Array(18).fill(null),
  // Player 2 — optional
  p2Active:false, p2Name:'', currentPlayer:1,
  p2scores:Array(18).fill(null), p2distances:Array(18).fill(null), p2misses:Array(18).fill(null),
  roundDate:new Date().toISOString().slice(0,10),
  _tempDist:0
};

// VALIDATED FORMULA MULTIPLIERS
const slopeMap = {zero:0, p5:0.5, low:1.0, low5:1.5, mod:2.0, mod5:2.5, strong:3.0, strong5:3.5, steep:4.0, severe:5.0};
const speedMap = {slow:0.8, med:1.0, fast:1.25, tour:1.5};
const hillMap  = {up:0.70, flat:1.0, down:1.35};
const grainMap = {with:0.90, across:1.0, against:1.15};
const speedIntentMap = {die:1.10, normal:1.0, firm:0.92}; // softened per simulation — real spread ~20%

// PROXIMITY FACTOR — Chad's fall line observation
// Cup low point creates funnel effect in last 2-3ft
// Center cup = no reduction (ball already on fall line)
// Threshold 15ft calibrated by Chris + Chad on course
function proximityReduction(distFt, cupLow) {
  if (cupLow === 'center') return 0;
  if (distFt <= 6)  return 0.35;
  if (distFt <= 10) return 0.25;
  if (distFt <= 15) return 0.15;
  return 0;
}

// CADDIE MEMORY — 3+ same-direction misses triggers adjustment
// Requires 3 (not 2) to reduce false positives on small sample
function getCaddieMemory() {
  const recent = state.misses.filter(m => m !== null && m !== 'made').slice(-5);
  if (recent.length < 3) return null;
  const c = {left:0,right:0,short:0,long:0};
  recent.forEach(m => { ['left','right','short','long'].forEach(k => { if (m.includes(k)) c[k]++; }); });
  if (c.left  >= 3) return 'Pattern: missing LEFT — aim 2" more right than calculated.';
  if (c.right >= 3) return 'Pattern: missing RIGHT — aim 2" more left than calculated.';
  if (c.short >= 3) return 'Pattern: leaving SHORT — hit 5-10% firmer.';
  if (c.long  >= 3) return 'Pattern: blowing PAST — take 5% off speed.';
  return null;
}

function getChadTip(distFt, hill, speed, grain, cup) {
  if (distFt > 30) return 'Lag — forget making it. Land in the 3ft circle. Speed wins.';
  if (hill === 'down' && (speed === 'fast' || speed === 'tour')) return 'Downhill fast green: aim less break, die it at the hole.';
  if (grain === 'against' && (state.slope === 'strong' || state.slope === 'severe')) return 'Against grain on steep slope — add 10% to your aim point.';
  if (distFt <= 6) return 'Inside 6ft: commit to the spot, do not look at the hole.';
  if (cup === 'left' || cup === 'right') return 'Cup low ' + cup + ' — the fall line does the last 18 inches.';
  return 'Commit to the line. Doubt misses more putts than bad reads.';
}

function calculate() {
  if (!state.slope || !state.hill || !state.speed || !state.grain || !state.cup) return;
  const distFt      = state.steps * 2.7;
  const slopePct    = slopeMap[state.slope];
  const intentMult  = speedIntentMap[state.speedIntent] || 1.0; // optional, defaults to normal
  // CORE FORMULA — validated
  const rawBreak = distFt * (slopePct / 2) * speedMap[state.speed] * hillMap[state.hill] * grainMap[state.grain];
  const reduction  = proximityReduction(distFt, state.cup);
  let adjBreak     = rawBreak * (1 - reduction) * intentMult;
  // Sanity cap — no green breaks more than 30% of putt distance
  adjBreak = Math.min(adjBreak, distFt * 12 * 0.30);
  const breakIn    = Math.round(adjBreak * 10) / 10;
  const rawBreakIn = Math.round(rawBreak * 10) / 10;
  const entryAngle = Math.round(Math.atan2(adjBreak/12, distFt) * (180/Math.PI) * 10) / 10;
  const apexFt     = Math.round(distFt * 0.6 * 10) / 10;
  const apexOff    = Math.round(adjBreak * 0.5 * 10) / 10;

  let breakDir, aimDir;
  if (state.cup === 'left')        { breakDir='Breaking Right → Left'; aimDir='Aim ' + fmtBreak(breakIn) + ' RIGHT of cup'; }
  else if (state.cup === 'right')  { breakDir='Breaking Left → Right'; aimDir='Aim ' + fmtBreak(breakIn) + ' LEFT of cup'; }
  else                             { breakDir='Straight — center fall line'; aimDir='Aim center, ' + fmtBreak(Math.round(adjBreak*0.3*10)/10) + ' above'; }

  const proximityNote = reduction > 0 ? ('⚡ Fall line active — proximity −' + Math.round(reduction*100) + '% (raw was ' + fmtBreak(rawBreakIn) + ')') : null;
  const memoryTip = getCaddieMemory();
  const chadTip   = getChadTip(distFt, state.hill, state.speed, state.grain, state.cup);
  const showLag   = distFt > 30;
  const safeSide  = state.cup==='left' ? 'Left (below hole)' : state.cup==='right' ? 'Right (below hole)' : 'Either side';

  renderResult({distFt, breakIn, rawBreakIn, entryAngle, apexFt, apexOff, breakDir, aimDir, slopePct, proximityNote, memoryTip, showLag, safeSide, reduction});
  renderTriangle({distFt, breakIn, cupLow:state.cup, showLag});
  // Chad tip lives above the putt logger so it's visible while logging
  const tipEl = document.getElementById('puttChadTip');
  if (chadTip) { tipEl.innerHTML = '🧠 Chad: ' + chadTip; tipEl.style.display = 'block'; }
  else tipEl.style.display = 'none';
  document.getElementById('puttLogSection').classList.add('visible');
  hideLogConfirm();
}

function fmtBreak(inches) {
  if (inches >= 12) {
    const ft=Math.floor(inches/12), rem=Math.round((inches%12)*10)/10;
    return rem > 0 ? ft+"' "+rem+'"' : ft+"'";
  }
  return inches+'"';
}

function renderResult({distFt, breakIn, entryAngle, apexFt, apexOff, breakDir, aimDir, slopePct, proximityNote, memoryTip, showLag, safeSide, reduction}) {
  const card = document.getElementById('resultCard');
  card.className = 'result-card has-result';
  const breakDisplay = fmtBreak(breakIn);
  const breakSub = breakIn>=12 ? (breakIn+'" total') : ((breakIn/12).toFixed(2)+"' ("+breakIn+'")');
  card.innerHTML =
    '<div class="result-header">' +
      '<div class="result-header-label">Your Read</div>' +
      '<div class="result-header-meta">'+distFt+' ft · '+slopePct+'% slope</div>' +
    '</div>' +
    '<div class="result-main">' +
      '<div class="result-break">'+breakDisplay+'</div>' +
      '<div class="result-break-label">'+breakSub+(reduction>0?' · proximity adj':'')+'</div>' +
      '<div class="result-direction">'+aimDir+'</div>' +
      '<div class="result-break-dir">'+breakDir+'</div>' +
      (proximityNote ? '<div class="proximity-block">'+proximityNote+'</div>' : '') +
      (memoryTip ? '<div class="memory-block">🧠 '+memoryTip+'</div>' : '') +
      (showLag ? '<div class="lag-block">🎯 Lag ('+distFt+'ft): 3ft circle is the target.<br><span class="safe-miss">Safe miss: '+safeSide+'</span></div>' : '') +
      '<div class="result-grid">' +
        '<div class="result-stat"><div class="result-stat-val">'+entryAngle+'°</div><div class="result-stat-label">Entry angle</div></div>' +
        '<div class="result-stat"><div class="result-stat-val">'+apexFt+' ft</div><div class="result-stat-label">Apex from ball</div></div>' +
        '<div class="result-stat"><div class="result-stat-val">'+fmtBreak(apexOff)+'</div><div class="result-stat-label">Apex offset</div></div>' +
        '<div class="result-stat"><div class="result-stat-val">'+distFt+' ft</div><div class="result-stat-label">Distance</div></div>' +
      '</div>' +
    '</div>';
}

function renderTriangle({distFt, breakIn, cupLow, showLag}) {
  document.getElementById('canvasSection').classList.add('visible');
  const canvas=document.getElementById('triangleCanvas'), dpr=window.devicePixelRatio||1;
  const W=canvas.parentElement.clientWidth, H=220;
  canvas.width=W*dpr; canvas.height=H*dpr; canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const G='#4eff80',GOLD='#f0c040',DIM='#2a3a4a',TDIM='#a0adb8',BG='#141a22',RED='#ff5555';
  ctx.fillStyle=BG; ctx.fillRect(0,0,W,H);
  const pad=36,bX=pad,bY=H-44,cX=W-pad,cY=H-44;
  const bDir=cupLow==='right'?1:-1;
  const aX=bX+(cX-bX)*0.6;
  const offPx=Math.min((breakIn/Math.max(distFt,1))*(W-pad*2)*0.55,72);
  const aY=bY-offPx*(cupLow==='center'?0.3:1)*bDir;
  if (showLag) {
    const pxFt=(W-2*pad)/distFt, hr=3*pxFt;
    const gr=ctx.createRadialGradient(cX,cY,0,cX,cY,hr);
    gr.addColorStop(0,'rgba(74,255,128,0.15)'); gr.addColorStop(1,'rgba(74,255,128,0)');
    ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(cX,cY,hr,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(74,255,128,0.3)'; ctx.lineWidth=1.5; ctx.setLineDash([3,6]);
    ctx.beginPath(); ctx.arc(cX,cY,hr,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='rgba(74,255,128,0.5)'; ctx.font='500 9px DM Sans,sans-serif'; ctx.textAlign='center';
    ctx.fillText('3ft zone',cX,cY-hr-6);
  }
  ctx.setLineDash([4,7]); ctx.strokeStyle=DIM; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(bX,bY); ctx.lineTo(cX,cY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='rgba(74,255,128,0.06)';
  ctx.beginPath(); ctx.moveTo(bX,bY); ctx.lineTo(aX,aY); ctx.lineTo(cX,cY); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(74,255,128,0.25)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(bX,bY); ctx.lineTo(aX,aY); ctx.lineTo(cX,cY); ctx.stroke();
  ctx.strokeStyle=G; ctx.lineWidth=3; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(bX,bY); ctx.quadraticCurveTo(aX,aY,cX,cY); ctx.stroke();
  ctx.fillStyle=GOLD; ctx.beginPath(); ctx.arc(aX,aY,5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(bX,bY,7,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle='#1a2230'; ctx.strokeStyle=G; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.arc(cX,cY,9,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=RED; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(cX,cY-9); ctx.lineTo(cX,cY-32); ctx.stroke();
  ctx.fillStyle=RED; ctx.beginPath(); ctx.moveTo(cX,cY-32); ctx.lineTo(cX+12,cY-26); ctx.lineTo(cX,cY-20); ctx.fill();
  ctx.font='600 11px DM Sans,sans-serif'; ctx.fillStyle=TDIM; ctx.textAlign='center';
  ctx.fillText('BALL',bX,bY+20); ctx.fillText('CUP',cX,cY+22);
  ctx.fillStyle=GOLD; ctx.fillText('APEX',aX,aY-13);
  if (Math.abs(aY-bY)>8) {
    ctx.strokeStyle=GOLD; ctx.lineWidth=1; ctx.setLineDash([3,4]);
    ctx.beginPath(); ctx.moveTo(aX,bY); ctx.lineTo(aX,aY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=GOLD; ctx.font='500 10px DM Mono,monospace';
    ctx.fillText(Math.round(breakIn*0.5*10)/10+'"',aX+16,(bY+aY)/2+4);
  }
  if (cupLow!=='center') {
    ctx.fillStyle=RED; ctx.font='600 10px DM Sans,sans-serif';
    ctx.textAlign=cupLow==='left'?'right':'left';
    ctx.fillText('LOW',cupLow==='left'?cX-15:cX+15,cY+4);
  }
}

function changeSteps(delta) {
  state.steps=Math.max(0.5,Math.min(60,Math.round((state.steps+delta)*2)/2));
  const ft=state.steps*2.7;
  document.getElementById('stepsVal').textContent=state.steps%1===0?state.steps:state.steps.toFixed(1);
  document.getElementById('feetVal').textContent='≈ '+(ft%1===0?ft:ft.toFixed(1))+' ft';
  // Cap S1 if it now exceeds total
  if (dbState.s1steps > state.steps - 0.5) {
    dbState.s1steps = Math.max(0.5, state.steps - 0.5);
    document.getElementById('dbS1Val').textContent = dbState.s1steps % 1 === 0 ? dbState.s1steps : dbState.s1steps.toFixed(1);
    document.getElementById('dbS1Ft').textContent = '≈ ' + Math.round(dbState.s1steps * 2.7 * 10)/10 + ' ft';
  }
  calculate();
  if (dbState.active) calculateDb();
}

// ── DISTANCE STEPPER — FEET, 1 ft increments ──
// First tap seeds from the green-read distance (steps × 2.7) if available
let _tempFeet = 0;
function changeDist(delta) {
  if (_tempFeet === 0) {
    const seed = Math.round(state.steps * 2.7);
    if (seed > 0) _tempFeet = seed;
  }
  _tempFeet = Math.max(1, Math.min(120, Math.round(_tempFeet + delta)));
  state._tempDist = _tempFeet; // stored in feet — data consistency
  document.getElementById('distVal').textContent = _tempFeet;
  document.getElementById('distFtVal').textContent = '';
}

function resetDistDisplay() {
  _tempFeet = 0;
  state._tempDist = 0;
  document.getElementById('distVal').textContent = '—';
  document.getElementById('distFtVal').textContent = '';
}

function sel(key,val,el) {
  state[key]=val;
  el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  calculate();
  if (dbState.active) calculateDb();
}

function changeHole(delta) {
  state.currentHole=Math.max(1,Math.min(18,state.currentHole+delta));
  updateHoleUI(); hideLogConfirm();
  resetDoubleBreaker();
}

function updateHoleUI() {
  const h=state.currentHole;
  document.getElementById('holeNum').textContent=h;
  document.getElementById('statHole').textContent=h;
  const score=state.scores[h-1], el=document.getElementById('holeLogged');
  const p2score=state.p2scores[h-1];
  let txt='', cls='hole-logged empty';
  if (score!==null) {
    txt='CVB:'+score;
    cls=score>=3?'hole-logged three':'hole-logged';
    if (state.p2Active && p2score!==null) txt+=' · '+state.p2Name+':'+p2score;
  }
  el.textContent=txt||'—'; el.className=cls;
}

function logPutts(n) {
  const h=state.currentHole;
  getCurrentScores()[h-1]=n;
  getCurrentDistances()[h-1]=state._tempDist||null;
  getCurrentMisses()[h-1]=null;
  saveRound(); updateHoleUI(); updateSessionStats(); updateScorecardBadge();
  document.getElementById('missSection').style.display='block';
  document.querySelectorAll('.miss-chip').forEach(c=>c.classList.remove('selected-miss'));
  _missSel={line:null,dist:null};
  document.getElementById('loggedConfirm').className='logged-confirm';
  document.getElementById('logP2Btn').classList.remove('visible');
}

// ── TWO-PART MISS: line (left/online/right) + distance (short/good/long) ──
let _missSel = {line:null, dist:null};

function selMissPart(kind, val, el) {
  _missSel[kind] = val;
  el.parentElement.querySelectorAll('.miss-chip').forEach(c=>c.classList.remove('selected-miss'));
  el.classList.add('selected-miss');
  if (_missSel.line && _missSel.dist) {
    // Combine: e.g. 'long-right', 'short-left', 'short', 'left', 'online'
    const parts=[];
    if (_missSel.dist!=='good') parts.push(_missSel.dist);
    if (_missSel.line!=='online') parts.push(_missSel.line);
    logMiss(parts.length ? parts.join('-') : 'online', null);
  }
}

function fmtMiss(m) {
  if (m==='made') return 'made it';
  if (m==='online') return 'burned the edge';
  return 'missed ' + m.split('-').join(' & ');
}

function logMiss(dir,el) {
  const h=state.currentHole;
  getCurrentMisses()[h-1]=dir; saveRound();
  if (dir==='made') {
    document.querySelectorAll('.miss-chip').forEach(c=>c.classList.remove('selected-miss'));
    if (el) el.classList.add('selected-miss');
    _missSel={line:null,dist:null};
  }
  const conf=document.getElementById('loggedConfirm');
  const score=getCurrentScores()[h-1];
  const isThree=score>=3, isMade=dir==='made';
  conf.className='logged-confirm show'+(isThree&&!isMade?' three-putt':'');
  const dist=getCurrentDistances()[h-1]?' · '+getCurrentDistances()[h-1]+'ft':'';
  const name=getCurrentName();
  if (isMade) conf.innerHTML='✅ '+name+' made it — Hole '+h+dist;
  else if (isThree) conf.innerHTML='🔴 '+name+' 3-putt, '+fmtMiss(dir)+' — Hole '+h+dist;
  else conf.innerHTML='✅ '+name+' '+score+' putts, '+fmtMiss(dir)+' — Hole '+h+dist;

  // Show Log P2 button if P2 active and we just logged P1, else auto-advance
  if (state.p2Active && state.currentPlayer===1) {
    const p2Btn = document.getElementById('logP2Btn');
    p2Btn.textContent = 'Log ' + state.p2Name + ' →';
    p2Btn.classList.add('visible');
  } else {
    // P2 logged or no P2 — advance hole
    if (h<18) {
      setTimeout(function(){
        state.currentHole=h+1;
        state.currentPlayer=1; // always reset to CVB for next hole
        updatePlayerToggle();
        resetDistDisplay();
        resetDoubleBreaker();
        document.getElementById('missSection').style.display='none';
        document.getElementById('logP2Btn').classList.remove('visible');
        document.querySelectorAll('.miss-chip').forEach(c=>c.classList.remove('selected-miss'));
        updateHoleUI(); hideLogConfirm();
      },1600);
    }
  }
}

function hideLogConfirm() {
  document.getElementById('loggedConfirm').className='logged-confirm';
  document.getElementById('missSection').style.display='none';
  document.querySelectorAll('.miss-chip').forEach(c=>c.classList.remove('selected-miss'));
  _missSel={line:null,dist:null};
}

function updateSessionStats() {
  // Session bar always shows CVB (P1) stats
  const played=state.scores.filter(s=>s!==null);
  const total=played.reduce((a,b)=>a+b,0);
  const three=played.filter(s=>s>=3).length;
  document.getElementById('statTotal').textContent=total;
  document.getElementById('statAvg').textContent=played.length?(total/played.length).toFixed(1):'—';
  document.getElementById('stat3Putt').textContent=three;
}

function updateScorecardBadge() {
  const three=state.scores.filter(s=>s!==null&&s>=3).length;
  const b=document.getElementById('threePuttBadge');
  b.style.display=three>0?'inline':'none'; b.textContent=three;
}

function saveRound() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({
    scores:state.scores, distances:state.distances, misses:state.misses,
    p2Active:state.p2Active, p2Name:state.p2Name,
    p2scores:state.p2scores, p2distances:state.p2distances, p2misses:state.p2misses,
    currentHole:state.currentHole, roundDate:state.roundDate
  })); } catch(e){}
}

function loadRound() {
  try {
    const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return;
    const s=JSON.parse(raw);
    if (s.roundDate!==new Date().toISOString().slice(0,10)) return;
    state.scores=s.scores||Array(18).fill(null); state.distances=s.distances||Array(18).fill(null);
    state.misses=s.misses||Array(18).fill(null); state.currentHole=s.currentHole||1; state.roundDate=s.roundDate;
    state.p2Active=s.p2Active||false; state.p2Name=s.p2Name||'';
    state.p2scores=s.p2scores||Array(18).fill(null); state.p2distances=s.p2distances||Array(18).fill(null);
    state.p2misses=s.p2misses||Array(18).fill(null);
    if (state.p2Active) restoreP2UI();
  } catch(e){}
}

function openScorecard() { renderScorecard(); document.getElementById('modalOverlay').classList.add('open'); }
function closeScorecard(e) { if (!e||e.target===document.getElementById('modalOverlay')) document.getElementById('modalOverlay').classList.remove('open'); }

function renderScorecard() {
  const played=state.scores.filter(s=>s!==null), total=played.reduce((a,b)=>a+b,0);
  const three=played.filter(s=>s>=3).length, avg=played.length?(total/played.length).toFixed(1):'—';

  document.getElementById('scorecardTotals').innerHTML=
    '<div class="sc-total"><div class="sc-total-val">'+(total||'—')+'</div><div class="sc-total-label">CVB Putts</div></div>'+
    '<div class="sc-total"><div class="sc-total-val">'+avg+'</div><div class="sc-total-label">Avg / Hole</div></div>'+
    '<div class="sc-total"><div class="sc-total-val red">'+three+'</div><div class="sc-total-label">3-Putts</div></div>';

  // Update header for P2
  const hdr=document.getElementById('scorecardHeader');
  if (state.p2Active) {
    hdr.innerHTML='<th>Hole</th><th>CVB</th><th>'+state.p2Name+'</th><th>Dist</th><th>Miss</th>';
  } else {
    hdr.innerHTML='<th>Hole</th><th>CVB</th><th>Dist</th><th>Miss</th>';
  }

  // Round Insights — CVB only (misses may be compound, e.g. 'long-right')
  const allMisses=state.misses.filter(m=>m!==null);
  const missL=allMisses.filter(m=>m!=='made'&&m.includes('left')).length;
  const missR=allMisses.filter(m=>m!=='made'&&m.includes('right')).length;
  const missS=allMisses.filter(m=>m!=='made'&&m.includes('short')).length;
  const missLg=allMisses.filter(m=>m!=='made'&&m.includes('long')).length;
  const made=allMisses.filter(m=>m==='made').length;
  const lagCount=state.distances.filter(d=>d!==null&&d>30).length;
  const shortCount=state.distances.filter(d=>d!==null&&d<=8).length;
  const shortMade=state.distances.map((d,i)=>d!==null&&d<=8&&state.misses[i]==='made').filter(Boolean).length;
  let coachLine='Keep going — more data needed.';
  if (played.length>=6) {
    if (missR>missL+2) coachLine='Missing mostly RIGHT — check face at impact.';
    else if (missL>missR+2) coachLine='Missing mostly LEFT — check shoulder line.';
    else if (missS>missLg+2) coachLine='Dying short — hit 10% firmer.';
    else if (missLg>missS+2) coachLine='Too aggressive — let the green work.';
    else if (three===0) coachLine='Zero 3-putts. Chad would be proud.';
    else coachLine='Balanced misses — trust the formula.';
  }
  const ins=document.getElementById('analyticsContent');
  ins.innerHTML = played.length===0
    ? '<span style="color:var(--text-muted)">No holes logged yet.</span>'
    : '<b>Lag (&gt;30ft):</b> '+lagCount+'<br><b>Short (≤8ft):</b> '+shortMade+'/'+shortCount+' made<br><b>Miss Bias:</b> Left '+missL+' · Right '+missR+'<br><b>Speed:</b> Short '+missS+' · Long '+missLg+' · Made '+made+'<br><br><span style="color:var(--gold)">🧠 Chad: </span>'+coachLine;

  // Rows
  const tbody=document.getElementById('scorecardBody'); tbody.innerHTML='';
  for (let i=0;i<18;i++) {
    const score=state.scores[i],dist=state.distances[i],miss=state.misses[i];
    const p2score=state.p2scores[i], isCur=(i+1)===state.currentHole;
    let pc='<td class="putts-cell" style="color:var(--text-muted)">—</td>';
    let dc='<td style="color:var(--text-muted);text-align:center;font-size:12px">—</td>';
    let mc='<td class="flag-cell">·</td>', p2c='';
    if (score!==null) {
      const cls=score===1?'one':score>=3?'three':'';
      pc='<td class="putts-cell '+cls+'">'+score+'</td>';
      dc='<td style="text-align:center;font-size:12px;color:var(--text-dim);font-family:\'DM Mono\',monospace">'+(dist?dist+'ft':'—')+'</td>';
      let icon='·';
      if (miss==='made') icon='🏆';
      else if (miss==='online') icon='○';
      else if (miss) {
        icon='';
        if (miss.includes('short')) icon+='⬇'; if (miss.includes('long')) icon+='⬆';
        if (miss.includes('left')) icon+='◀'; if (miss.includes('right')) icon+='▶';
      }
      const col=miss==='made'?'color:var(--green)':score>=3?'color:var(--red)':'color:var(--text-dim)';
      mc='<td class="flag-cell" style="'+col+'">'+icon+'</td>';
    }
    if (state.p2Active) {
      p2c = p2score!==null
        ? '<td class="putts-cell '+(p2score===1?'one':p2score>=3?'three':'')+'" style="color:var(--gold)">'+p2score+'</td>'
        : '<td class="putts-cell" style="color:var(--text-muted)">—</td>';
    }
    tbody.innerHTML+='<tr class="'+(isCur?'current-hole':'')+'"><td>H'+(i+1)+(isCur?' ←':'')+'</td>'+pc+(state.p2Active?p2c:'')+dc+mc+'</tr>';
  }
}

let _resetArmed = null;
function disarmReset() {
  if (_resetArmed) clearTimeout(_resetArmed);
  _resetArmed = null;
  const btn = document.getElementById('resetBtn');
  btn.textContent = '↺ Reset';
  btn.style.borderColor = ''; btn.style.color = '';
}

function confirmReset() {
  const btn = document.getElementById('resetBtn');
  if (!_resetArmed) {
    // First tap — arm, require second tap within 3s
    btn.textContent = '⚠ Tap again to reset';
    btn.style.borderColor = 'var(--red)'; btn.style.color = 'var(--red)';
    _resetArmed = setTimeout(disarmReset, 3000);
    return;
  }
  disarmReset();
  state.scores=Array(18).fill(null); state.distances=Array(18).fill(null); state.misses=Array(18).fill(null);
  state.p2scores=Array(18).fill(null); state.p2distances=Array(18).fill(null); state.p2misses=Array(18).fill(null);
  state.p2Active=false; state.p2Name=''; state.currentPlayer=1;
  state.currentHole=1; state.roundDate=new Date().toISOString().slice(0,10);
  state.slope=null; state.hill=null; state.speed=null; state.speedIntent='normal'; state.grain=null; state.cup=null; state.steps=8;
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));
  document.querySelectorAll('.miss-chip').forEach(c=>c.classList.remove('selected-miss'));
  _missSel={line:null,dist:null};
  document.getElementById('puttChadTip').style.display='none';
  document.getElementById('stepsVal').textContent='8';
  document.getElementById('feetVal').textContent='≈ 21.6 ft';
  document.getElementById('p2Btn').style.display='none';
  document.getElementById('addP2Btn').style.display='block';
  document.getElementById('p2InputRow').style.display='none';
  document.getElementById('p2NameInput').value='';
  document.getElementById('logP2Btn').classList.remove('visible');
  updatePlayerToggle();
  resetDistDisplay();
  document.getElementById('resultCard').className='result-card';
  document.getElementById('resultCard').innerHTML='<div class="empty-result"><span class="empty-icon">📐</span>Select all inputs to read the green</div>';
  document.getElementById('canvasSection').classList.remove('visible');
  document.getElementById('puttLogSection').classList.remove('visible');
  document.getElementById('missSection').style.display='none';
  document.getElementById('loggedConfirm').className='logged-confirm';
  saveRound(); updateHoleUI(); updateSessionStats(); updateScorecardBadge();
  resetDoubleBreaker();
  document.getElementById('modalOverlay').classList.remove('open');
}

function exportRound() {
  const played=state.scores.filter(s=>s!==null), total=played.reduce((a,b)=>a+b,0);
  const p1holes=state.scores.map((s,i)=>s===null?null:{hole:i+1,putts:s,distance:state.distances[i],miss:state.misses[i],proximityAdjusted:state.distances[i]!==null&&state.distances[i]<=15}).filter(Boolean);
  const payload={
    date:state.roundDate, holesPlayed:played.length,
    player1:{ name:'CVB', totalPutts:total, threePutts:played.filter(s=>s>=3).length, onePutts:played.filter(s=>s===1).length, avg:played.length?+(total/played.length).toFixed(2):null, holes:p1holes }
  };
  if (state.p2Active) {
    const p2played=state.p2scores.filter(s=>s!==null), p2total=p2played.reduce((a,b)=>a+b,0);
    payload.player2={ name:state.p2Name, totalPutts:p2total, threePutts:p2played.filter(s=>s>=3).length, onePutts:p2played.filter(s=>s===1).length, avg:p2played.length?+(p2total/p2played.length).toFixed(2):null,
      holes:state.p2scores.map((s,i)=>s===null?null:{hole:i+1,putts:s,distance:state.p2distances[i],miss:state.p2misses[i],proximityAdjusted:state.p2distances[i]!==null&&state.p2distances[i]<=15}).filter(Boolean)
    };
  }
  const json=JSON.stringify(payload,null,2);
  try { navigator.clipboard.writeText(json); document.getElementById('exportStatus').textContent='✅ Copied — paste into Cowork with scorecard photo'; }
  catch(e) { document.getElementById('exportStatus').textContent='Copy the text below manually'; }
  document.getElementById('exportText').textContent=json;
  document.getElementById('exportOverlay').classList.add('open');
}

function closeExport() { document.getElementById('exportOverlay').classList.remove('open'); }

// ── DOUBLE BREAKER STATE ──
const dbState = {
  active: false,
  s1steps: 4, s1slope: null, s1hill: null, s1cup: null,
  s2slope: null, s2hill: null, s2cup: null
};

function toggleDoubleBreaker() {
  dbState.active = !dbState.active;
  const btn = document.getElementById('dbToggleBtn');
  const sec = document.getElementById('dbSection');
  if (dbState.active) {
    btn.textContent = 'ON'; btn.classList.add('active');
    sec.style.display = 'block';
  } else {
    btn.textContent = 'OFF'; btn.classList.remove('active');
    sec.style.display = 'none';
  }
}

function resetDoubleBreaker() {
  dbState.active = false;
  dbState.s1steps = 4;
  dbState.s1slope = null; dbState.s1hill = null; dbState.s1cup = null;
  dbState.s2slope = null; dbState.s2hill = null; dbState.s2cup = null;
  document.getElementById('dbToggleBtn').textContent = 'OFF';
  document.getElementById('dbToggleBtn').classList.remove('active');
  document.getElementById('dbSection').style.display = 'none';
  document.getElementById('dbS1Val').textContent = '4';
  document.getElementById('dbS1Ft').textContent = '≈ 10.8 ft';
  document.getElementById('dbCanvasSection').style.display = 'none';
  document.getElementById('dbResultCard').className = 'result-card';
  document.getElementById('dbResultCard').innerHTML = '<div class="empty-result"><span class="empty-icon">↗️</span>Set both segments to read the double breaker</div>';
  document.querySelectorAll('#dbSection .chip').forEach(c => c.classList.remove('selected'));
}

function changeDbSteps(seg, delta) {
  const maxS1 = Math.max(0.5, state.steps - 0.5); // S1 cannot exceed total - 0.5
  dbState.s1steps = Math.max(0.5, Math.min(maxS1, Math.round((dbState.s1steps + delta) * 2) / 2));
  const ft = Math.round(dbState.s1steps * 2.7 * 10) / 10;
  document.getElementById('dbS1Val').textContent = dbState.s1steps % 1 === 0 ? dbState.s1steps : dbState.s1steps.toFixed(1);
  document.getElementById('dbS1Ft').textContent = '≈ ' + ft + ' ft';
  calculateDb();
}

function selDb(key, val, el) {
  dbState[key] = val;
  // Clear siblings in same group
  const groupClass = 'db-' + key;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  calculateDb();
}

function calculateDb() {
  if (!state.slope || !state.hill || !state.speed || !state.grain || !state.cup) return;
  if (!dbState.s1slope || !dbState.s1hill || !dbState.s1cup) return;
  if (!dbState.s2slope || !dbState.s2hill || !dbState.s2cup) return;

  const totalSteps = state.steps;
  const s1steps = dbState.s1steps;
  const s2steps = Math.max(0.5, totalSteps - s1steps);

  const s1ft = s1steps * 2.7;
  const s2ft = s2steps * 2.7;

  // Update S2 label
  document.getElementById('dbS2Label').textContent =
    s2steps.toFixed(1) + ' steps (' + Math.round(s2ft * 10)/10 + ' ft) — auto-calculated';

  // Shared multipliers
  const speedM  = speedMap[state.speed];
  const grainM  = grainMap[state.grain];
  const intentM = speedIntentMap[state.speedIntent] || 1.0;

  // S1 break
  const s1raw = s1ft * (slopeMap[dbState.s1slope] / 2) * speedM * hillMap[dbState.s1hill] * grainM;
  const s1prox = proximityReduction(s1ft, dbState.s1cup);
  const s1break = s1raw * (1 - s1prox);

  // S2 break — weighted by inflection position
  const inflectionRatio = s1steps / totalSteps;
  const s2weight = 1.0 + (inflectionRatio * 0.20);
  const s2raw = s2ft * (slopeMap[dbState.s2slope] / 2) * speedM * hillMap[dbState.s2hill] * grainM;
  const s2prox = proximityReduction(s2ft, dbState.s2cup);
  const s2break = s2raw * (1 - s2prox) * s2weight * intentM;

  const s1breakR = Math.round(s1break * 10) / 10;
  const s2breakR = Math.round(s2break * 10) / 10;

  // Determine directions FIRST — combine logic depends on them
  const s1dir = dbState.s1cup === 'left' ? 'R' : dbState.s1cup === 'right' ? 'L' : 'C';
  const s2dir = dbState.s2cup === 'left' ? 'R' : dbState.s2cup === 'right' ? 'L' : 'C';
  const sameDir = s1dir === s2dir || s1dir === 'C' || s2dir === 'C';

  // Same direction (or one straight): breaks stack
  // Opposing (S-curve): breaks partially cancel — S2 dominates, S1 contributes half its counter
  let totalBreak;
  if (sameDir) {
    totalBreak = s1break + s2break;
  } else {
    totalBreak = Math.max(0, s2break - (s1break * 0.5));
  }
  // Sanity cap — 30% of total putt distance
  const totalFt = totalSteps * 2.7;
  totalBreak = Math.min(totalBreak, totalFt * 12 * 0.30);
  totalBreak = Math.round(totalBreak * 10) / 10;

  const dirLabel = (s1dir === s2dir)
    ? (s2dir === 'R' ? 'Both breaking RIGHT' : s2dir === 'L' ? 'Both breaking LEFT' : 'Straight')
    : (!sameDir
      ? 'S-CURVE: S1 ' + (s1dir==='R'?'→ Right':'← Left') + ' · S2 ' + (s2dir==='R'?'→ Right':'← Left') + ' (netted)'
      : 'S1 ' + (s1dir==='C'?'straight':(s1dir==='R'?'→ Right':'← Left')) + ' · S2 ' + (s2dir==='C'?'straight':(s2dir==='R'?'→ Right':'← Left')));

  // Aim direction always follows S2 (the break at the cup)
  const aimDir2 = s2dir !== 'C' ? s2dir : s1dir;
  const finalAim = aimDir2 === 'R'
    ? 'Final aim: ' + fmtBreak(totalBreak) + ' RIGHT of cup'
    : aimDir2 === 'L'
    ? 'Final aim: ' + fmtBreak(totalBreak) + ' LEFT of cup'
    : 'Final aim: center, ' + fmtBreak(totalBreak) + ' above';

  // Render DB result
  const card = document.getElementById('dbResultCard');
  card.className = 'result-card has-result';
  card.innerHTML =
    '<div class="result-header"><div class="result-header-label">Double Breaker</div>' +
    '<div class="result-header-meta">' + Math.round(state.steps*2.7*10)/10 + ' ft total</div></div>' +
    '<div class="result-main">' +
    '<div class="result-break">' + fmtBreak(totalBreak) + '</div>' +
    '<div class="result-break-label">combined break</div>' +
    '<div class="result-direction">' + finalAim + '</div>' +
    '<div class="result-break-dir">' + dirLabel + '</div>' +
    '<div class="result-grid">' +
    '<div class="result-stat"><div class="result-stat-val" style="color:var(--green)">' + fmtBreak(s1breakR) + '</div><div class="result-stat-label">S1 break</div></div>' +
    '<div class="result-stat"><div class="result-stat-val" style="color:var(--gold)">' + fmtBreak(s2breakR) + '</div><div class="result-stat-label">S2 break (×' + s2weight.toFixed(2) + ')</div></div>' +
    '<div class="result-stat"><div class="result-stat-val">' + Math.round(s1ft*10)/10 + ' ft</div><div class="result-stat-label">S1 distance</div></div>' +
    '<div class="result-stat"><div class="result-stat-val">' + Math.round(s2ft*10)/10 + ' ft</div><div class="result-stat-label">S2 distance</div></div>' +
    '</div></div>';

  // Render DB triangle
  renderDbTriangle({ s1ft, s2ft, s1break: s1breakR, s2break: s2breakR, s1cup: dbState.s1cup, s2cup: dbState.s2cup });
}

function renderDbTriangle({ s1ft, s2ft, s1break, s2break, s1cup, s2cup }) {
  const sec = document.getElementById('dbCanvasSection');
  sec.style.display = 'block';
  const canvas = document.getElementById('dbCanvas');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth, H = 260;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

  const GREEN='#4eff80', GOLD='#f0c040', DIM='#2a3a4a', TDIM='#a0adb8', BG='#141a22', RED='#ff5555';
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

  const pad = 32;
  const totalFt = s1ft + s2ft;
  const inflectX = pad + ((W - pad*2) * (s1ft / totalFt));
  const ballX = pad, ballY = H - 48;
  const cupX = W - pad, cupY = H - 48;

  // Inflection point Y — midline
  const inflectY = ballY;

  // S1 apex
  const s1bDir = s1cup === 'right' ? 1 : -1;
  const s1apexX = ballX + (inflectX - ballX) * 0.6;
  const s1offPx = Math.min((s1break / Math.max(s1ft,1)) * (inflectX - ballX) * 0.55, 55);
  const s1apexY = ballY - s1offPx * (s1cup === 'center' ? 0.2 : 1) * s1bDir;

  // S2 apex
  const s2bDir = s2cup === 'right' ? 1 : -1;
  const s2apexX = inflectX + (cupX - inflectX) * 0.6;
  const s2offPx = Math.min((s2break / Math.max(s2ft,1)) * (cupX - inflectX) * 0.55, 55);
  const s2apexY = inflectY - s2offPx * (s2cup === 'center' ? 0.2 : 1) * s2bDir;

  // Straight line
  ctx.setLineDash([4,7]); ctx.strokeStyle=DIM; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(ballX,ballY); ctx.lineTo(cupX,cupY); ctx.stroke(); ctx.setLineDash([]);

  // Inflection vertical marker
  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1; ctx.setLineDash([3,5]);
  ctx.beginPath(); ctx.moveTo(inflectX, ballY-60); ctx.lineTo(inflectX, ballY+20); ctx.stroke(); ctx.setLineDash([]);

  // S1 arc — green
  ctx.strokeStyle=GREEN; ctx.lineWidth=3; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(ballX,ballY); ctx.quadraticCurveTo(s1apexX,s1apexY,inflectX,inflectY); ctx.stroke();

  // S2 arc — gold
  ctx.strokeStyle=GOLD; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(inflectX,inflectY); ctx.quadraticCurveTo(s2apexX,s2apexY,cupX,cupY); ctx.stroke();

  // Combined overlay — faint white dashed
  ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1.5; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(ballX,ballY); ctx.bezierCurveTo(s1apexX,s1apexY,s2apexX,s2apexY,cupX,cupY); ctx.stroke(); ctx.setLineDash([]);

  // Inflection dot
  ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(inflectX,inflectY,5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=DIM; ctx.lineWidth=1.5; ctx.stroke();

  // Ball
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(ballX,ballY,7,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.stroke();

  // Cup
  ctx.fillStyle='#1a2230'; ctx.strokeStyle=GREEN; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.arc(cupX,cupY,9,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=RED; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(cupX,cupY-9); ctx.lineTo(cupX,cupY-32); ctx.stroke();
  ctx.fillStyle=RED; ctx.beginPath(); ctx.moveTo(cupX,cupY-32); ctx.lineTo(cupX+12,cupY-26); ctx.lineTo(cupX,cupY-20); ctx.fill();

  // Labels
  ctx.font='600 11px DM Sans,sans-serif'; ctx.fillStyle=TDIM; ctx.textAlign='center';
  ctx.fillText('BALL',ballX,ballY+20); ctx.fillText('CUP',cupX,cupY+22);
  ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.fillText('INFL.',inflectX,inflectY+20);
  ctx.fillStyle=GREEN; ctx.fillText('S1',s1apexX,s1apexY-12);
  ctx.fillStyle=GOLD;  ctx.fillText('S2',s2apexX,s2apexY-12);
}
function activatePlayer2() {
  document.getElementById('addP2Btn').style.display = 'none';
  document.getElementById('p2InputRow').style.display = 'flex';
  document.getElementById('p2NameInput').focus();
}

function confirmPlayer2() {
  const input = document.getElementById('p2NameInput');
  const name = input.value;
  if (!name || !name.trim()) { input.focus(); return; }
  document.getElementById('p2InputRow').style.display = 'none';
  state.p2Active = true;
  state.p2Name = name.trim().slice(0, 12);
  saveRound();
  restoreP2UI();
}

function restoreP2UI() {
  const p2Btn = document.getElementById('p2Btn');
  p2Btn.textContent = state.p2Name;
  p2Btn.style.display = 'block';
  document.getElementById('addP2Btn').style.display = 'none';
  updatePlayerToggle();
}

function switchPlayer(n) {
  state.currentPlayer = n;
  updatePlayerToggle();
  // Reset dist and miss section for the new player context
  resetDistDisplay();
  document.getElementById('missSection').style.display = 'none';
  document.getElementById('loggedConfirm').className = 'logged-confirm';
  document.getElementById('logP2Btn').classList.remove('visible');
  document.querySelectorAll('.miss-chip').forEach(c=>c.classList.remove('selected-miss'));
  _missSel={line:null,dist:null};
}

function updatePlayerToggle() {
  const p1 = document.getElementById('p1Btn');
  const p2 = document.getElementById('p2Btn');
  if (state.currentPlayer === 1) {
    p1.className = 'player-btn active';
    p2.className = 'player-btn';
  } else {
    p1.className = 'player-btn';
    p2.className = 'player-btn p2-active';
  }
}

function startLogP2() {
  // Switch to P2 for logging on same hole
  state.currentPlayer = 2;
  updatePlayerToggle();
  resetDistDisplay();
  document.getElementById('missSection').style.display = 'none';
  document.getElementById('loggedConfirm').className = 'logged-confirm';
  document.getElementById('logP2Btn').classList.remove('visible');
  document.querySelectorAll('.miss-chip').forEach(c=>c.classList.remove('selected-miss'));
  _missSel={line:null,dist:null};
  // Re-show putt chips
  document.getElementById('puttLogSection').classList.add('visible');
  // Scroll to putt section
  document.getElementById('puttLogSection').scrollIntoView({behavior:'smooth', block:'start'});
}

function getCurrentScores() { return state.currentPlayer===1 ? state.scores : state.p2scores; }
function getCurrentDistances() { return state.currentPlayer===1 ? state.distances : state.p2distances; }
function getCurrentMisses() { return state.currentPlayer===1 ? state.misses : state.p2misses; }
function getCurrentName() { return state.currentPlayer===1 ? 'CVB' : state.p2Name; }

window.addEventListener('resize',function(){
  if (state.slope&&state.hill&&state.speed&&state.grain&&state.cup) {
    const d=state.steps*2.7,s=slopeMap[state.slope];
    const raw=d*(s/2)*speedMap[state.speed]*hillMap[state.hill]*grainMap[state.grain];
    const red=proximityReduction(d,state.cup);
    renderTriangle({distFt:d,breakIn:Math.round(raw*(1-red)*10)/10,cupLow:state.cup,showLag:d>30});
  }
},{passive:true});

document.addEventListener('DOMContentLoaded',function(){
  loadRound();
  updateHoleUI();
  updateSessionStats();
  updateScorecardBadge();
  updatePlayerToggle();
  // Fix feet display to match 2.7 multiplier
  document.getElementById('feetVal').textContent = '≈ ' + (state.steps * 2.7) + ' ft';
});
