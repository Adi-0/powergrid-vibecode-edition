# Progress

An isometric, zoomable, explorable model of the California power grid.

**Last updated:** phases 1–3 complete.

---

## Build order and state

| # | Phase | State |
|---|---|---|
| 1 | Solver core and synthetic network | **complete** |
| 2 | System view — isometric rendering, real flows, pan and zoom | **complete** |
| 3 | Time scrubber, line tripping, seasons, inspector, glossary | **complete** |
| 4 | Substation → distribution feeder → service | not started |
| 5 | Math panel with full worked derivations | not started |
| 6 | Plant and machine branch | not started |
| 7 | Faults and protection | not started |
| 8 | Breadth: remaining generation types, regions, guided path | not started |

---

## Phase 1 — complete

### What exists

**Solver core** (`src/core/`)

- `complex.ts` — complex arithmetic in the notation the field uses (`a + jb`, `V∠θ`)
- `network.ts` — the network data model, per-unit throughout
- `ybus.ts` — bus admittance matrix, with off-nominal tap transformers
- `linalg.ts` — dense LU with partial pivoting, written out to be read
- `powerflow.ts` — Newton–Raphson in polar form, with DC initialisation,
  backtracking line search, and reactive-limit switching with restoration
- `dc-powerflow.ts` — the linear approximation; both a teaching artifact and the
  feasibility check that found the network's structural problems
- `gauss-seidel.ts` — an independent solver, for cross-validation and because it
  is the one a person can run by hand
- `results.ts` — branch flows, losses, violations, every intermediate exposed
- `lines.ts` — line parameters computed from conductor geometry, not typed in
- `validate.ts` — structural checks that say what is actually wrong

**Data** (`src/data/`)

- `ieee14.ts`, `ieee30.ts` — **generated** from the authoritative MATPOWER case
  files by `tools/gen-ieee-case.mjs`, not transcribed
- `california/` — 68-bus synthetic network: geography, sites, element builders,
  and the network itself
- `simplifications.ts` — the model-honesty register, source of truth for both
  the docs and the in-app panel

**Simulation** (`src/sim/`)

- `profiles.ts` — daily demand, solar, wind and hydro shapes; monotone cubic
  interpolation so solar never goes negative after sunset
- `dispatch.ts` — merit-order dispatch with unit commitment, storage arbitrage,
  curtailment and the marginal unit
- `reactive-ops.ts` — voltage- and reactive-utilisation-controlled shunt switching
- `operate.ts` — solves a network the way it would actually be operated

### What it does

| Check | Result |
|---|---|
| IEEE 14-bus power-flow residual | 7×10⁻¹⁵ pu |
| IEEE 30-bus power-flow residual | 1.8×10⁻¹⁴ pu |
| Newton–Raphson vs Gauss–Seidel agreement | ≤ 7×10⁻¹² pu |
| IEEE 14-bus published loss (13.393 MW) | 13.3933 MW |
| California: hours converging with reactive limits enforced | 48 / 48 |
| California: branch overloads in the base case | 0 |
| California: voltage violations in the base case | 0 |
| California: transmission losses | 2.4 – 3.6 % |
| California: solve time per hour | ~10 ms |
| Tests | 69 passing |

### What was learned, and recorded

Five decision records in `docs/decisions/`. The two worth reading are **0003**
(the published IEEE 30-bus table is not self-consistent with its own generator
records, so "validate to 1e-6 against it" had to be reinterpreted honestly) and
**0004** (the first network had no AC solution at all; the DC power flow was used
as a feasibility check, and every failure turned out to be a real design defect
rather than a solver problem).

---

## Phases 2 and 3 — complete

### What exists

**Rendering** (`src/render/`)

- `style.ts` — the visual language as constants: the weight scale, the one
  signal colour, the isometric angle, the zoom levels. Documented in
  `docs/style.md`.
- `line-batch.ts` — instanced quad lines at constant screen-space width, with a
  capsule signed-distance fragment shader giving antialiasing, round caps and
  pixel-space dash patterns in one pass
- `iso.ts` — the orthographic isometric camera, pan, zoom-about-cursor, and the
  exact ground-plane basis that lets a symbol drawn flat on the ground project
  to an exact shape on screen
- `symbols.ts` — one-line diagram symbology, standard where a standard exists
- `labels.ts` — screen-space labels with a collision-avoiding layout pass and
  leader lines
- `world.ts` — the vertical layering of voltage classes, and the exaggeration
  that makes it visible
- `scene-system.ts` — the system view, assembled in painter's order

**Interface** (`src/app/`)

- `state.ts` — one snapshot, re-solved on every change; no second copy of any number
- `viewport.ts` — the render loop, picking, and the level-transition fly-to
- `legend.ts` — generated from the renderer's own constants
- `inspector.ts` — every quantity with its symbol, unit, and per-unit-with-base
- `scrubber.ts` — the time control, with the duck curve plotted from the live dispatch
- `honesty.ts` — the model-honesty register and the searchable glossary
- `tooltip.ts` — the `term()` helper that makes the no-unglossed-jargon rule enforceable

**Data**

- `glossary.ts` — 48 entries, each with the standard term, the standard symbol,
  a plain-language definition and a sense of scale

### What it does

| Check | Result |
|---|---|
| Hours converging, three seasons, reactive limits enforced | 72 / 72 |
| Branch overloads / voltage violations in the base case | 0 / 0 |
| Price range across the three days | $14 – $46 /MWh |
| Spring midday net load (17.8 GW demand) | 1.5 GW |
| Terms used in the interface with no glossary entry | 0 |
| Tests | 117 passing |

---

## Next: phase 4 — substation, feeder, service

The path to the wall outlet. The brief says this branch matters most, and it is
the one that makes the whole claim land: the chain has to terminate at something
the reader already touches every day.

---

## Running it

```
npm install
npm test          # 69 tests
npm run typecheck
npm run dev       # once phase 2 exists
```
