# Progress

An isometric, zoomable, explorable model of the California power grid.

**Last updated:** phase 1 complete.

---

## Build order and state

| # | Phase | State |
|---|---|---|
| 1 | Solver core and synthetic network | **complete** |
| 2 | System view — isometric rendering, real flows, pan and zoom | not started |
| 3 | Time scrubber, line tripping, region view, first level transition | not started |
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

## Next: phase 2 — the system view

Isometric rendering of the solved state. The rendering problems the brief
identifies — quad-based lines for constant screen-space width, hidden-line
removal with ground-coloured faces, screen-space label layout, level-of-detail
streaming — are the substance of this phase, not incidental to it.

---

## Running it

```
npm install
npm test          # 69 tests
npm run typecheck
npm run dev       # once phase 2 exists
```
