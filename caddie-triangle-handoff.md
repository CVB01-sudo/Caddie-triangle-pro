# Caddie Triangle Pro — Project Handoff
**© 2026 Chris Van Buskirk. All rights reserved.**
*Proprietary method. Unauthorized reproduction prohibited.*

---

## Origin Story
Developed June 2026. Chris Van Buskirk played a round with professional caddie **Chad**, who read greens using a triangle method — distance divided by 2 plus angle of the cup. Chris described the method to Claude, we reverse-engineered the formula, and built a mobile data-collection app in one conversation over one free beer.

---

## The Core Formula

```
Break (inches) = Distance (ft) × (Slope% / 2) × speedMult × hillMult × grainMult × intentMult
```

### Validated Multipliers

| Input | Option | Multiplier | Notes |
|-------|--------|-----------|-------|
| **Slope** | 0 / 0.5 / 1 / 1.5 / 2 / 2.5 / 3 / 3.5 / 4 / 5 % | exact % value | 10 precise increments (Chad revision). Jump 4%→5% intentional |
| **Hill** | Uphill | 0.70× | Kills break |
| | Flat | 1.0× | Baseline |
| | Downhill | 1.35× | Amplifies break |
| **Green Speed** | Slow | 0.80× | Stimp ~8 |
| | Med | 1.00× | Stimp ~10 |
| | Fast | 1.25× | Stimp ~12 |
| | Tour | 1.50× | Stimp 13+ |
| **Grain** | With | 0.90× | −10% break |
| | Across | 1.00× | Neutral |
| | Against | 1.15× | +15% break |
| **Capture Speed** | Die It | 1.10× | Ball barely crosses hole (softened per sim, June 2026) |
| | Normal | 1.00× | 12–18" past |
| | Firm | 0.92× | Charge the back (softened per sim) |

**Sanity cap:** total break never exceeds 30% of putt distance — `min(break, distFt × 12 × 0.30)`. Applied to both single and double breaker.

**slopeMap keys:** `zero:0, p5:0.5, low:1.0, low5:1.5, mod:2.0, mod5:2.5, strong:3.0, strong5:3.5, steep:4.0, severe:5.0`

---

## Step Calibration

**Measured June 2026:** 4 steps = 115 inches = **2.396 ft per step**

Applied +12% course adjustment (casual walking stride is shorter than measured stride):
`2.396 × 1.12 = 2.684 → rounded to **2.7 ft per step**`

**Formula uses:** `distance_ft = steps × 2.7`

To refine: if putts consistently feel long → drop to 2.6. If short → bump to 2.8. Real round data will tell us.

---



Three vertices:
- **A** = Ball position
- **B** = Cup
- **C** = Apex (high point of arc, ~60% of distance from ball)

Apex offset = 50% of total break  
Entry angle = `arctan(break_inches / 12 / distance_ft)` in degrees

---

## Chad's Fall Line Factor (Proximity Reduction)

**Chris + Chad observation:** On putts inside 15ft, the cup low point creates a funnel — the ball finds the bottom naturally. The formula over-calculates required aim point on short putts.

```
if cup_low === 'center': reduction = 0  (already on fall line)
if distance ≤ 6ft:  reduction = 35%
if distance ≤ 10ft: reduction = 25%
if distance ≤ 15ft: reduction = 15%
if distance > 15ft: reduction = 0  (full formula)
```

Adjusted break = `rawBreak × (1 - reduction) × intentMult`

**Threshold:** 15ft (calibrated by Chris + Chad on course, June 2026)
**To validate:** Does the threshold hold at 15ft or should it extend to 18-20ft?

---

## Caddie Memory

Tracks last 5 logged miss directions. Fires a live compensation tip after **3+ misses in the same direction** (not 2 — requires 3 to reduce false positives on small samples).

```
3+ left  → "Aim 2" more right than calculated"
3+ right → "Aim 2" more left than calculated"
3+ short → "Hit 5-10% firmer"
3+ long  → "Take 5% off speed"
```

---

## Lag Strategy

Fires on putts > 30ft. Triangle diagram shows a **3ft halo** around the cup — the target zone. Safe miss direction based on cup low point (miss below the hole, not above).

---

## The 7 Inputs (In Order)

1. **Distance** — steps × 2.7ft (0.5 step increments, calibrated to Chris's actual stride + 12% course adjustment)
2. **Slope** — Zero / Low / Mod / Strong / Severe
3. **Putt Direction** — Uphill / Flat / Downhill
4. **Green Speed** — Slow / Med / Fast / Tour *(set once per round)*
5. **Capture Speed** — Die It / Normal / Firm
6. **Grain** — With / Across / Against *(set once per round, Bermuda)*
7. **Cup Low Point** — Left / Center / Right

**Gate:** Formula fires when all 5 per-putt inputs are set (speed + grain are persistent).

---

## Per-Hole Data Logged

```json
{
  "hole": 4,
  "putts": 2,
  "distance": 22.5,
  "miss": "right",
  "proximityAdjusted": false
}
```

**Miss options:** made / left / right / short / long

---

## Round Export Schema

```json
{
  "date": "2026-06-26",
  "holesPlayed": 18,
  "totalPutts": 32,
  "threePutts": 1,
  "onePutts": 4,
  "twoPutts": 13,
  "avg": 1.78,
  "holes": [...]
}
```

---

## Double Breaker Mode (Chad Method, June 2026)

Rare on flat Florida courses — toggle below result card, defaults OFF, **auto-resets OFF every hole advance**.

**Chad's method:** Walk the full putt, note steps at the inflection point (where slope changes). Inflection can be anywhere on the line, not just the low side.

**Inputs:**
- Total steps (main distance input, shared)
- S1 steps = ball → inflection (capped at total − 0.5, silently)
- S2 steps = auto-calculated (total − S1)
- Per segment: own slope, hill/direction, cup low point
- Shared: green speed, grain, capture speed

**Formula:**
```
S1break = S1ft × (S1slope%/2) × speedM × S1hillM × grainM × (1 − S1proximity)
inflectionRatio = S1steps / totalSteps
S2weight = 1.0 + (inflectionRatio × 0.20)   // later inflection = slower ball = more break
S2break = S2ft × (S2slope%/2) × speedM × S2hillM × grainM × (1 − S2proximity) × S2weight × intentM

// Combine (June 2026 sim revision):
Same direction (or one straight): TotalBreak = S1break + S2break
Opposing (S-curve): TotalBreak = max(0, S2break − S1break × 0.5)   // S2 dominates, S1 half-cancels
Cap: TotalBreak = min(TotalBreak, totalFt × 12 × 0.30)
Aim direction always follows S2 (the break at the cup)
```

**Visualization:** S1 arc green → inflection dot (white) → S2 arc gold → cup, with faint white dashed combined overlay.

**To validate with data:** the 0.20 S2 weight coefficient, the 0.5 opposing-break cancel factor, and the 30% break cap.

---

## Two-Player Mode

Optional. CVB is always Player 1 — hardcoded, always active. Player 2 is off by default — zero UI changes if never activated.

**To activate:** Tap "+ Add Player 2" → enter name → done.

**Per-hole flow:**
1. Read the green once (shared inputs)
2. Log CVB putts + miss → "Log [Player 2]" button appears
3. Tap it → log Player 2 putts + miss → advances to next hole
4. Skip Player 2 on any hole — tap hole advance arrow, no penalty

**State:** Separate `scores/distances/misses` arrays per player. Read inputs (slope, hill, speed, grain, cup) shared.

**Scorecard:** Shows both columns when P2 active. P2 putts in gold.

**Export schema with P2:**
```json
{
  "date": "2026-06-26",
  "holesPlayed": 18,
  "player1": { "name": "CVB", "totalPutts": 32, "threePutts": 1, "avg": 1.78, "holes": [...] },
  "player2": { "name": "Chad", "totalPutts": 30, "threePutts": 0, "avg": 1.67, "holes": [...] }
}
```

**Reset:** Clears both players, removes P2 entirely, returns to single-player mode.

---



Fires after 6+ holes. Tracks:
- Lag putts (>30ft)
- Short putt conversion (≤8ft made/attempted)
- Miss bias (left vs right count)
- Speed control (short vs long count)
- Chad coaching line based on dominant pattern

---

## Formula Refinement Roadmap

### What real data will tell us:

| Variable | Current Value | How to Validate |
|----------|--------------|-----------------|
| Proximity threshold | 15ft | Do made putts cluster below 15ft? Extend to 18ft? |
| Proximity reduction ≤6ft | 35% | Are short putts with cup influence going in? |
| Downhill multiplier | 1.35× | Consistent long misses downhill = reduce |
| Grain against | +15% | Systematic miss on against-grain putts = adjust |
| Die It factor | +20% | Does dying it actually add 20% break? |

### After 6-7 rounds:
1. Export JSON from each round
2. Bring to Cowork with scorecard photo
3. Cross-reference distance vs miss direction vs proximity flag
4. Adjust multipliers based on systematic patterns

---

## Three Rules (Non-Negotiable)

1. **Lag is the job on anything over 20ft** — 3ft circle, not the hole
2. **Never be short** — Die It means crossing the hole, not dying before it
3. **Commit to the aim point** — doubt kills more putts than bad reads

---

## Files

| File | Description |
|------|-------------|
| `caddie-triangle-pro.html` | Main app — all inputs, triangle viz, putt tracker, scorecard, export |
| `caddie-guide.html` | Field guide — 7 sections, mobile-optimized reference |

**Storage:** localStorage, same-day persistence, auto-resets next calendar day
**Export:** JSON to clipboard → paste into Cowork with scorecard photo

---

## Cowork Prompt (Post-Round)

> "I've been building the Caddie Triangle Pro putting app using Chad's triangle method. Here's my round export [paste JSON] and my scorecard [photo]. The core formula is: Break(in) = Distance(ft) × (Slope%/2) × speedMult × hillMult × grainMult × intentMult. Proximity factor reduces break inside 15ft. What are my putting patterns? Are any multipliers consistently off? What should we tune?"

---

## Key People

- **Chris Van Buskirk** — Creator, CCO at B2 Bank, 12-13 handicap targeting sub-10
- **Chad** — Professional caddie who originated the triangle method
- **Target courses** — Champion's Gate National (June 30, birthday round), OMG Thursday league

---

*Built in one conversation. One free beer. Chad's method, Claude's math, Chris's vision.*
*© 2026 Chris Van Buskirk. All rights reserved.*
