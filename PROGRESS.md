# Progress

An isometric, zoomable, explorable model of the California power grid.

**Last updated:** phases 1–4 complete.

---

## Build order and state

| # | Phase | State |
|---|---|---|
| 1 | Solver core and synthetic network | **complete** |
| 2 | System view — isometric rendering, real flows, pan and zoom | **complete** |
| 3 | Time scrubber, line tripping, seasons, inspector, glossary | **complete** |
| 4 | Substation → distribution feeder → service | **complete** |
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

- `glossary.ts` — 81 entries, each with the standard term, the standard symbol,
  a plain-language definition and a sense of scale

### What it does

| Check | Result |
|---|---|
| Hours converging, three seasons, reactive limits enforced | 72 / 72 |
| Branch overloads / voltage violations in the base case | 0 / 0 |
| Price range across the three days | $14 – $46 /MWh |
| Spring midday net load (17.8 GW demand) | 1.5 GW |
| Terms used in the interface with no glossary entry | 0 |
| Tests | 170 passing |

---

## Phase 4 — complete

**The path to the wall outlet.** The brief says this branch matters most, and it
is the one that makes the whole claim land: the chain has to terminate at
something the reader already touches every day. It now does.

### The one architectural decision

**There are no levels.** There is one world, in metres, and one camera. The 500
kV line from Malin, the Eden Vale switchyard, the poles along Cherry Lane and
the socket in the kitchen all sit at their true coordinates relative to one
another, and travelling between them is a single continuous zoom of about sixty
thousand to one — no cut, no reload, no second copy of anything.

What changes with scale is only which drawings are worth rendering. In the
overlap between two scenes both are drawn, from the same solved case, so the
reader watches a site symbol dissolve into a fenced yard, or a single 12.47 kV
branch resolve into a line of poles. The numbers agree across the transition
because they are the same numbers. Decision **0010**.

### What exists

**Eden Vale substation** (`src/data/california/substation.ts`,
`src/render/scene-substation.ts`)

Thirty-five pieces of equipment, each carrying **both** a yard coordinate
(metres east, north, and above grade) and a single-line-diagram coordinate. The
view interpolates: slide the control and the diagram lying flat stands up into
the yard it describes. The schematic frame is built from the camera's ground
basis so the diagram is square on the page — buses horizontal, bays vertical —
rather than sheared into a parallelogram by the isometric projection.

Every label carries a live number read out of the solve: bank loading, bus
voltage in kV and per-unit, feeder current, how much of the capacitor bank is
switched in at this hour. The full ANSI/IEEE C37.2 protection scheme (87T, 87B,
51, 50, 50N/51N, 79, 21, 67, 49, 63, 27/59) is in the inspector, each device
explained in a paragraph a beginner can read.

The normally-open bus tie is drawn open, in ink — **not** in the signal colour.
A normally-open device is not a fault.

**Cherry Lane 1201** (`src/data/california/feeder.ts`,
`src/render/scene-feeder.ts`, `src/app/profile.ts`)

Three kilometres of street drawn at the height the wires actually hang: poles,
crossarms where there are three phases and none where there is one, fused
cutouts where each lateral taps off the main, a recloser, a step voltage
regulator, a switched capacitor bank and a normally-open tie. The vertical
exaggeration used at system scale is retired — a distribution pole really is
about eleven metres tall.

Beside it, the **voltage profile**: per-unit against distance along the wire,
with the ANSI C84.1 Range A limits drawn, the regulator's step visible as a
vertical jump and the capacitor's effect as a kink. Every point is a solved bus
voltage.

**14 Cherry Lane** (`src/data/california/service.ts`,
`src/render/scene-service.ts`)

The pad-mounted transformer, the buried lateral, the meter, the panel, the
grounding electrode, one branch circuit and a NEMA 5-15R socket. The power flow
solves to the transformer's secondary terminals; the last twenty metres are
worked with ΔV = I·(R·cos φ + X·sin φ) over the loop, from NEC Chapter 9 Table 9,
and the whole calculation is in the inspector. Decision **0011**.

### Perturbation at the bottom of the tree

Switching on an appliance adds a real load to the real case and re-solves the
whole state. The car charger at 18:00 on a summer day:

| | off | on |
|---|---|---|
| System demand | 33,925.9780 MW | 33,925.9895 MW |
| System losses | 901.7323 MW | 901.7350 MW |
| Total generation | 34,827.7103 MW | 34,827.7245 MW |
| Transformer secondary | 243.97 V | 243.20 V |
| Voltage at the socket | 121.90 V | 121.20 V |
| Current in the service | 13.2 A | 61.0 A |

Demand rises by 11.5 kW exactly; losses by 2.7 kW, because it has to be carried
four hundred kilometres; generation by 14.2 kW, out of the marginal unit. The 50
kVA transformer goes over its nameplate and says so.

### What it does

| Check | Result |
|---|---|
| Buses in the case, Oregon border to kitchen socket | 90 |
| Branches | 254 |
| Feeder peak load / customers | 7.1 MW / 1,585 |
| Voltage at the modelled socket, 18:00 summer | 121.90 V (ANSI C84.1 Range A: 110–126 V) |
| Substation elements with a live number from the solve | all of them |
| New model-honesty entries | 5 (18 in total) |
| New glossary entries | 17 (81 in total) |
| Tests | 170 passing |

### What was rebuilt after looking at it

The brief requires screenshotting your own renders and critiquing them before
advancing. Four things were rebuilt on the evidence of a screenshot:

- The **substation single-line diagram** was first laid flat on the isometric
  ground plane, which sheared it into a parallelogram with buses running as long
  diagonals across the page. Rebuilt on a screen-aligned frame.
- The **feeder route** originally ran south-east, which is exactly the
  projection's depth axis, so three kilometres of street drew as a vertical
  line. Re-laid along the east axis, with laterals at right angles, so the main
  and its branches fall on two different isometric axes.
- **Bus labels** were struck through by the heaviest line in the drawing.
  Anchored a fixed number of screen pixels past the end of the bar instead.
- The **service view** showed the house as a full wireframe box that outweighed
  every wire inside it. Reduced to a footprint and four corner posts.

---

## Running it

```
npm install
npm test          # 170 tests
npm run typecheck
npm run dev
```
