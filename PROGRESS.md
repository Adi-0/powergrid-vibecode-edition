# Progress

Current phase: **4 — Scrubber, trips, region view, first transition**

| Phase | State | Done-condition |
|---|---|---|
| 0 Setup | done | Screenshot of a test scene shows visible line work |
| 1 Transmission solver + network | done | IEEE 14/30 pass; synthetic net converges 24 h; balance holds |
| 2 Distribution solver + coupling | done | IEEE 13 passes; energy closes across boundary |
| 3 System view | done | 60 fps full network; legend complete; critique recorded |
| 4 Scrubber, trips, region, transition | — | Live re-solve per interval; honest no-solution |
| 5 Substation → feeder → service | — | Outlet traceable to transmission; meters + losses = head |
| 6 Math panel | — | Arithmetic-consistency test passes on every panel |
| 7 Plant + machine + SFR | — | Plant energy closes; SMIB equal-area fixture |
| 8 Faults + protection | — | Textbook fault fixture; coordinated sequence |
| 9 Breadth + guided path | — | — |

## Log
- **Phase 0 done.** Vite + TS 7 + three 0.186 + Vitest + Playwright. `CLAUDE.md` holds the
  brief's invariants. Typeface "Atlas Sans" (Plex subset + drawn ∠). Instanced
  screen-space line renderer with continuous dashes and GPU collapse morph; ground
  faces with polygon offset for hidden-line removal. `npm run shots` renders
  `?scene=test` in headless Chromium (SwiftShader) and probes the frame: 6,763 ink
  pixels (a blank WebGL canvas gives 0). Screenshot: `screenshots/test-scene.png`.
- **Phase 1 done.** Newton–Raphson AC power flow with distributed slack (two
  participation modes), P/Q limits, island detection and honest no-solution statuses;
  DC power flow; dense LU; two-phase simplex LP. IEEE 14 / 30 / IEEE-30 match pandapower
  3.5.5 to 1e-6 pu. Carson + Kron line constants reproduce IEEE 13-node configs 601–605.
  Synthetic California network: 57 sites, 78 buses, 215 branches, line parameters
  computed from tower geometry. Quasi-static day (96 × 15 min): solar from sun
  geometry, storage and hydro scheduling, priority-list commitment, merit-order dispatch
  with DC security constraints (LMPs), then AC power flow with switched-shunt voltage
  control. All 96 intervals converge; balance closes to <1e-4 MW; losses 1.5–2.6 %;
  duck curve emerges (noon net load < 60 % of evening). N-1 at 18:00: 209/214 within
  emergency ratings; San Diego's import is the deliberate weak point (SWPL loss → no
  operating point). 44 tests pass.
- **Phase 2 done.** Unbalanced three-phase backward/forward sweep (Kersting generalised
  matrices): lines, Δ–Yg and Yg–Yg banks, regulators with line-drop compensation,
  center-tapped service transformers, triplex, switches, wye/delta/120/240 V loads with
  P/Z/I models. IEEE 13-node: published voltages to 2e-4 pu / 0.013°, LDC finds taps
  10/8/11, OpenDSS agrees to 3e-4 pu. Evergreen 1105: 636 nodes, 380 homes, one wall
  outlet (118.4 V at 19:00 with a 1.5 kW hair dryer). Coupling at Evergreen 60 kV
  converges in 3–4 passes; energy closes across the boundary and at the feeder head to
  < 0.01 W. 55 tests pass. Known: the sweep uses object-per-complex arithmetic (~150 ms
  per feeder solve) — to be optimised before the feeder view goes live.
- **Phase 3 done.** System sheet: California as a hatched-section slab on the ground
  shared with its neighbours (break lines where the sheet stops), north up
  (decision 0005 revised), circuits one stroke each by voltage class, flow chevrons
  sized and moving by solved MW, one-line site symbols, overload/no-source marks
  paired with the signal colour. Key always lists exactly what is drawn (115/60 kV and
  generators appear past 1.5 px/km, and the key with them). Inspector for circuits and
  places with every number from the display layer; glossary terms inline; formulas
  typeset. Selection is focus-and-context. Phone layout: folding key, compact title
  block. Hidden-line precision fixed with stencilled surfaces and per-fragment line
  depth (decision 0015). The harness now fails any view with a digit outside the
  display layer. Performance, full network, camera moving: 1.7 ms average / 4.4 ms
  max main-thread per frame, 8 draw calls, 9.5k triangles. GPU frame rate could not be
  measured here (software rasteriser only) — stated, not claimed. Critique:
  `docs/critique/phase-3.md`. 59 tests pass.
