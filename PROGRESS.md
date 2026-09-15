# Progress

An isometric, zoomable, explorable model of the California power grid.

**Last updated:** all eight phases complete, plus two quality passes.

---

## Build order and state

| # | Phase | State |
|---|---|---|
| 1 | Solver core and synthetic network | **complete** |
| 2 | System view — isometric rendering, real flows, pan and zoom | **complete** |
| 3 | Time scrubber, line tripping, seasons, inspector, glossary | **complete** |
| 4 | Substation → distribution feeder → service | **complete** |
| 5 | Math panel with full worked derivations | **complete** |
| 6 | Plant and machine branch | **complete** |
| 7 | Faults and protection | **complete** |
| 8 | Breadth: the solver panel, reliability indices, motor starting, Ferranti, the planning factors, and the guided path | **complete** |

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

## Phase 5 — complete

**The working, in full, for whatever is selected.** This is the panel the whole
project is an argument for: everything else shows a reader what the system is
doing, and this shows why that is the answer, in the form they would have to
write it down themselves.

### The one architectural decision

**The substituted line is not a description of the arithmetic. It is the
arithmetic.** A derivation step holds one string of numbers and operators, which
is evaluated to produce the value printed beneath it. There is no second
computation in TypeScript to drift out of step with the prose, because there is
no prose — and `test/math-panel.test.ts` takes the same string off the page and
checks it against the solver. The string a reader sees and the string the test
checks are the same string. Decision **0012**.

### What exists

**`src/math/expr.ts`** — a deliberately tiny infix parser: arithmetic,
parentheses, and the functions power engineering uses. `ln` is natural and `log`
is base ten, as the field writes them; `sind`/`cosd` take degrees, as angles are
quoted. No variables, no assignment, no way to reach outside the expression.

**`src/math/derive.ts`** — the derivations. Per-unit bases; a bus; a branch, in
sixteen steps from impedance in ohms to complex power, with the series
admittance, the voltage difference, the series current and the charging current
all on the page; where a line's impedance came from, in conductor geometry; a
transformer's impedance from its nameplate, with the base change; the service
voltage drop; and the whole system as one equation.

**`src/math/for-selection.ts`** — which derivations belong to what is selected. A
current transformer's working is the working for the circuit it is measuring,
which is also the honest answer to "what is this for".

**`src/app/mathpanel.ts`** — the panel. Sign convention first and drawn, then the
bases, then numbered steps: general form, the arithmetic, the result with units,
and where a step reproduces something the solver computed, the two side by side.

### The two tests the brief asks for by name

**Every math panel's arithmetic is internally consistent** —
`test/math-panel.test.ts`, 104 tests. It evaluates every step of every
derivation the app can show, checks the printed result is what the printed
working produces, and checks agreement with the solver wherever a step claims it.

**No displayed quantity is a hardcoded constant** —
`test/no-hardcoded-quantities.test.ts`. Every scene returns its labels as data,
so the test collects literally every string the drawing shows, across five
states of the system, and requires every number that does not move to be
explicitly accounted for in a register of genuine constants with reasons.
Verified non-vacuous by breaking the thing it guards. Decision **0013**.

### What the tests caught

| Defect | How it was found |
|---|---|
| Bundle radius formula carried a spurious factor of n | Checked against the model's own `bundleRadius` |
| Loading computed at the from end, not the end working hardest | Disagreed with the solver by 2.2 % on a tapped transformer |
| Line-geometry derivation offered for cables, whose phases are concentric | Per-unit reactance came out 160× the branch's own |
| A second copy of the voltage-to-tower mapping, with the wrong ids | Returned null for every line in the case |
| `^(1/3)` rendered as a superscript 1 followed by `/3)` | Reading the screenshot |
| Operands printed as `2500.000000`, and `1000 · 7.6` tightened so it read as binding first | Reading the screenshot |

### What it does

| Check | Result |
|---|---|
| Derivations checked step by step | every one the app can show |
| Steps whose printed result is not what their printed working produces | 0 |
| Steps disagreeing with the solver beyond their stated rounding | 0 |
| Displayed numbers that do not move and are not accounted for | 0 |
| Tests | 287 passing |

---

## Phase 6 — complete

**The generation branch.** The brief's zoom tree has two: one ends at a socket,
the other at a rotor. They meet at the system view, because that is where the
power goes — out of a machine, through a plant, into the network.

### What exists

**Metcalf Energy Center** (`src/data/california/plant.ts`,
`src/render/scene-plant.ts`). The only large plant inside the Bay Area, feeding
the bus that feeds Eden Vale, which feeds Cherry Lane — so the whole application
is one thread from gas burning to a kettle boiling.

Its energy chain is worked from the heat rate already in the network model, and
the condenser stream is computed as the remainder so that what goes in equals
what comes out to the last decimal. At 300 MW out: 642 MW of gas in, 202 MW from
each gas turbine, 104 MW from the steam turbine, 58 MW up the stack, and 270 MW
— more than it exports — into the cooling tower.

Thermal streams are drawn as **ducts** whose width is the power in them, so line
weight stays reserved for voltage class on the conductors. The exhaust duct out
of a gas turbine is visibly enormous and the pipe to the cooling tower is wider
than everything electrical on the site. Decision **0014**.

**One synchronous machine** (`src/core/machine.ts`,
`src/render/scene-machine.ts`, `src/app/machine-panel.ts`). Three stator
windings 120° apart, a rotor drawn at the load angle the solver found, and the
terminal-voltage reference it is measured from. Beside it the **capability
curve** — the armature circle, the field circle, the practical reactive limits
and the δ = 90° stability limit, with the operating point moving around inside
them — and the **phasor diagram** of E = V + jX_d·I as the triangle it is.

Then inertia: H as the real time it is, the stored kinetic energy, the rate of
change of frequency if this unit tripped, and how much of the fleet is actually
spinning.

### What the drawings caught

| Defect | How |
|---|---|
| The only Bay Area plant was dispatched off at peak | The plant view was blank |
| Committing it at the end of the stack curtailed wind at the evening peak | Curtailment appeared where none should be |
| Free energy was thrown away before anything burning fuel was turned down | Curtailment at hours with gas still above its minimum |
| The sunniest hour of the spring priced at the most expensive unit in the fleet | $96/MWh at midday oversupply |
| A 300 MW machine showing exactly 0 MVAr at power factor 1.000 | Reading `generator.qMVAr`, a setpoint the solver never writes back |
| A sagging terminal voltage appeared to *increase* reactive capability | The field circle was rebuilt at the wrong voltage |
| The bundle radius formula carried a spurious factor of n | Checked against the model's own `bundleRadius` |
| The rotation arrowhead pointed nowhere | It was built from a fixed offset, not from the tangent |

### What it does

| Check | Result |
|---|---|
| Plant energy chain residual | < 10⁻⁹ of the fuel stream, at every output |
| Heat to the cooling tower | 42 % of fuel — more than the plant exports |
| Machine equations inverted and re-solved | agree to 10⁻⁶ |
| Reliability must-run unit committed | all 24 hours, every season |
| Demand unserved | 0 MW, every hour, every season |
| New model-honesty entries | 5 (23 in total) |
| New glossary entries | 8 (89 in total) |
| Tests | 368 passing |

---

## Phase 7 — complete

**Faults and protection.** The one place the balanced positive-sequence
assumption is abandoned, because a fault breaks it by definition.

### What exists

**Symmetrical components** (`src/core/sequence.ts`). The a operator, the forward
and inverse transforms, the residual current a ground relay actually measures,
and the unbalance factor. Exactly reversible, and tested as such.

**Three sequence networks** (`src/core/fault.ts`). Positive and negative see much
the same passive network with every machine behind its subtransient reactance;
zero sequence sees a different network entirely, assembled winding by winding.
A delta is an open circuit to it — which is the whole reason a distribution
transformer is delta on the high side.

The Thevenin impedance at a bus comes from solving Y·z = e_k rather than forming
an inverse, and the solve is restricted to the island the bus is in, because the
zero-sequence network genuinely falls into islands and a bus with no path to
earth genuinely has infinite zero-sequence impedance.

**Four fault types**, each with its own connection of the three networks stated
in words and in arithmetic: three-phase, single line to ground, line to line, and
double line to ground.

**Inverse-time protection** (`src/core/protection.ts`) to IEEE C37.112, with the
published constants, and coordination checked across the whole range of fault
currents the feeder can produce.

**The Cherry Lane chain** (`src/data/california/protection-scheme.ts`): a lateral
fuse, a recloser, the feeder breaker and the transformer's backup relay, with
every setting derived from the feeder's own load and fault levels rather than
typed in.

**The coordination plot** (`src/app/tcc-panel.ts`) on log–log axes, with the
fault currents the network can actually produce drawn as rules, and a dot where
each device would operate.

### What it says

| Fault | Cleared by | Time | Who notices |
|---|---|---|---|
| On a lateral | the lateral fuse | 0.015 s | one street |
| On the feeder main | Recloser R1 | 0.60 s | one feeder, briefly |
| On the 12.47 kV busbar | bank differential 87B | 0.05 s | the station's low-voltage bus |

### What the tests caught

| Defect | How |
|---|---|
| A fuse on Cherry Lane "cleared" a fault on the substation busbar | It is not in series with it; selectivity is geometry before it is timing |
| The zero-sequence solve failed on a singular pivot | The network is genuinely disconnected — the fix was to say so, not to add a shunt |
| An autotransformer was read as blocking zero sequence | The vector group parser looked for "a" in the wrong position |
| Coordination "failed" above 7.4 kA | The breaker's instantaneous quite properly beats the recloser there; the check was asking beyond the range a downstream fault can produce |
| A 23 kA bus fault was quoted at 2.2 seconds | That is the backup relay; the differential clears it in three cycles |

### What it does

| Check | Result |
|---|---|
| Symmetrical component transform reversibility | exact to 10⁻¹² |
| Residual = 3·I₀ | exact to 10⁻¹¹ |
| Line-to-line fault against three-phase | 0.87, as √3/2 says |
| Fault level at the 12.47 kV bus / far end of the feeder | 23 kA / 4.6 kA |
| Coordination checks across the feeder's fault range | 83, no crossings |
| New model-honesty entries | 4 (27 in total) |
| New glossary entries | 9 (98 in total) |
| Tests | 471 passing |

---

## Phase 8 — complete

**Breadth, and the one thing in the app that is a route.** Everything the brief
names that the first seven phases had not built.

### What exists

**How it was solved** (`src/app/solver-panel.ts`). The shape of the problem — PQ,
PV and slack counted, the 154 unknowns, the Jacobian's 4.15 % of non-zero
entries — then the convergence itself, plotted TWICE: the warm-started solve that
produced what is on screen, and the identical case solved cold from a DC
estimate. The cold curve is the one that shows Newton working. The panel states
how far apart the two answers are (a few parts in 10¹³) rather than claiming they
agree. The path breaks wherever a machine hit a reactive limit, with the break
marked "problem changed", because either side is convergence on a different set
of equations.

**How often the lights go out** (`src/sim/reliability.ts`, `reliability-panel.ts`).
SAIFI, SAIDI, CAIDI, MAIFI and ASAI, computed from section lengths, canonical
failure rates and which device clears which fault — never quoted. Three switches
that change all of them: the recloser, fuse saving, and the tie to the next
feeder. The lateral fuses are derived from the feeder's own data (a fuse belongs
wherever a single-phase circuit taps off the main), and the substation is in the
sum: the 12.47 kV bus is the largest single contributor to SAIDI despite almost
never failing, while a fault on either 115 kV line contributes exactly zero.

**Starting a motor** (`src/core/motor.ts`, `src/sim/motor-start.ts`). A 200 hp
NEMA Design B motor with a code G nameplate, started across the line, through a
65 % autotransformer or on a soft starter, in either of two places on the feeder.
Two full solves: one before, one with the locked-rotor demand in the case and the
capacitor banks and tap changers held where the first one left them, because
neither can move in the second a start takes. The textbook estimate — starting
kVA over short-circuit kVA — is printed next to the solved answer, and they agree
to two decimal places.

**The Ferranti effect** (`src/sim/ferranti.ts`). A parallel circuit energised
from the sending bus with its far breaker open — what actually happens in a
control room — and the answer given three ways: the nominal π model the solver
uses, the exact distributed-parameter result, and the solve. They agree to four
figures on 230 km and differ by a point on 496 km, which is where a real study
stops using a lumped model.

**The four planning ratios** (`src/sim/factors.ts`). Load, capacity, demand and
coincidence, computed from the dispatched day and the feeder's own load data. A
coincidence factor of 0.73 is why a 50 kVA transformer serves twelve houses whose
services could each pass 24 kW; a capacity factor of 1.000 against 0.000 says what
a baseload machine and a peaking machine are for.

**The guided path** (`src/app/guide.ts`). Fourteen steps from the whole state to
a wall socket and back out to a generator's capability curve. Every step DOES
something and then says one short thing about it; every step sets the whole state
it needs, so the dots along the bottom can be jumped to in any order; and it
drives the same public controls a reader would use by hand, so leaving the path
leaves the app where the path got to.

### What the drawings caught

| Symptom | Cause |
|---|---|
| The convergence plot was a flat line at 10⁻¹² with a jump in it | It was the warm-started re-solve. Honest, and useless as a picture of the method — so the cold solve is drawn beside it |
| The worked example in the reliability panel read λ = 0 · 0 | The worst contributor is the substation bus, which has no length. The example is now the worst piece of WIRE |
| Starting the motor dipped the feeder four times too far | `operate()` was re-seating the tap changers from their defaults, so the comparison was against a different feeder. Found because the rule of thumb disagreed |
| Opening a 500 kV intertie collapsed half the state | Energise a parallel circuit instead, which is what a control room actually does |
| Jumping to step 7 of the path showed the feeder's text over the system view | Every step now sets the whole state it needs, not a difference from the step before |

### What it does

| Check | Result |
|---|---|
| SAIFI / SAIDI / CAIDI, Cherry Lane 1201 | 0.28 /yr · 21 min/yr · 75 min |
| MAIFI, and what fuse blowing does to it | 1.08 → 0.67, while SAIFI goes 0.28 → 0.34 |
| Motor start dip, industrial unit / far end | 0.50 % / 1.22 %, against 241 MVA / 96 MVA of stiffness |
| Rule of thumb against the solve | agrees to 0.01 % of voltage in all six cases |
| Ferranti rise, 496 km at 500 kV | +24.65 % (π), +23.66 % (distributed) |
| Load factor · fleet capacity factor · coincidence factor | 0.775 · 0.482 · 0.728 |
| New model-honesty entries | 4 (31 in total) |
| New glossary entries | 8 (105 in total) |
| Tests | 648 passing (663 after the quality passes) |

---

## Quality, in two passes

The eight phases were all built and all tested and the result was still, in the
reviewer's words, "a bit of a mess". Two review passes follow, each recorded in
full: [0017](docs/decisions/0017-the-quality-pass.md) and
[0018](docs/decisions/0018-the-second-quality-pass.md).

The method in both was to instrument the app rather than squint at it. Four
tools live in `tools/`:

| Tool | What it answers |
|---|---|
| `audit.mjs` | Is every view composed? Segments, labels, scale, breadcrumb, panel and active scenes, for all fourteen |
| `navigate.mjs` | Does getting there work? All forty-two journeys between the seven levels, failing if a destination is reached at a different scale depending on where you started |
| `guide-walk.mjs` | Does the fourteen-step path land where it says? |
| `crop.mjs` | Does it hold up at print scale? One view at three times device scale, cropped |
| `states.mjs` | Does it hold up when something is wrong? A tripped backbone, a fault on a busbar, an overloaded pad-mount, a motor starting |

### What the second pass found

| Symptom | Cause |
|---|---|
| Zooming in "is buggy" | The per-position floor on how far in it is worth going was clamping commanded FLIGHTS. Half way to one house the only thing under the camera is a feeder, so the journey stopped at the scale of a street. Route-dependent, so it came and went |
| The same destination arrived at two different sizes | Framing asked what panels were open NOW rather than what the destination will have |
| The yard filled less than half an empty page, in one corner | The camera framed a ground rectangle. A yard eighty metres across standing twelve metres up is mostly height on the page |
| The map read as a mess | The label layout knew where the other labels were and nothing about the drawing under them |
| `13.7 MVA · 8 %` four times in a column | A terminal, its breaker, its disconnect and its bus all carry the same current. The drawing now never writes the same number twice |
| The legend stopped at a heading and a horizontal cut | Two panels each claiming a fixed fraction of one column, and a legend listing everything the renderer can draw rather than what is on the page |
| Three kilometres of empty ruled paper at the feeder | Houses waited until seven pixels; at the scale the level is FOR they are four |
| 500 kV corridors read as barber's poles | Flow marks at a 15 px pitch, four tenths as long and nearly as wide as the conductor |
| The demand scatter re-rolled every hour | Its extent came from the load on show rather than from the site's annual peak |
| A fault on a busbar was drawn nowhere | The feeder marked its faults and the substation did not, so 23 kA in the panel sat beside a drawing with nothing wrong in it |
| The panel explaining a circuit covered the circuit | Nothing panned when a panel opened over the subject |
| Captions behind panels | The layout knew about the drawing and nothing about what was lying over it |

---

## Running it

```
npm install
npm test          # 663 tests
npm run typecheck
npm run dev
```
