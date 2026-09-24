# Progress

Current phase: **all nine phases done** — see the known weaknesses in each phase's critique

| Phase | State | Done-condition |
|---|---|---|
| 0 Setup | done | Screenshot of a test scene shows visible line work |
| 1 Transmission solver + network | done | IEEE 14/30 pass; synthetic net converges 24 h; balance holds |
| 2 Distribution solver + coupling | done | IEEE 13 passes; energy closes across boundary |
| 3 System view | done | 60 fps full network; legend complete; critique recorded |
| 4 Scrubber, trips, region, transition | done | Live re-solve per interval; honest no-solution |
| 5 Substation → feeder → service | done | Outlet traceable to transmission; meters + losses = head |
| 6 Math panel | done | Arithmetic-consistency test passes on every panel |
| 7 Plant + machine + SFR | done | Plant energy closes; SMIB equal-area fixture |
| 8 Faults + protection | done | Textbook fault fixture; coordinated sequence |
| 9 Breadth + guided path | done | Honesty panel fed from the doc; glossary; skippable, re-enterable route |

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
- **Phase 4 done.** The solver thread answers solve requests (interval + tripped
  branches) between the day's own intervals; the sheet shows an interval only once it
  has been solved for what the reader asked (decision 0016). Day strip with the duck,
  keyboard stepping and playback (every shown interval solved live). Trips and restores
  from the inspector; outcomes solved / partly dark / none drawn honestly on the map,
  title block, inspector and a notice, with a limits notice and camera flights to
  overloads. Region level for the Bay Area as an exploded axonometric of voltage
  layers, with transformers, generation risers, demand drops and the region's energy
  balance; System ↔ Region transition is the fold of those layers (decision 0017).
  Transformer inspector. Paper tooth at close zoom. Test: every branch tripped alone at
  19:00 and 12:30 either balances to 1 µW or reports no operating point with a reason
  (1 of 217 at 19:00: the Southwest Powerlink); cutting Evergreen off reports exactly
  its demand as unserved; an islanded unit's output is made up elsewhere. Rendering
  fixes: offset strokes' depth, instanced batches that grow. Critique:
  `docs/critique/phase-4.md`. 63 tests pass.
- **Phase 5 done.** Level stack with per-level frames and an unfold transition out of a
  node (decision 0018). Evergreen substation as an isometric yard (60 kV entries,
  breakers, bus, 30 MVA bank with tap changer, 12 kV switchgear, feeder exits) with its
  balance; feeder 1105 pole by pole with devices, pole-top transformers and 380 homes,
  its balance (meters + losses = head, residual 0.000 W) and a voltage profile against
  ANSI C84.1; a service with the outlet home cut open, and the trace from Metcalf's
  230 kV bus to the outlet on one 120 V base (123.60 V → 118.08 V at 19:00). The worker
  solves the substation and feeder coupled to the transmission system whenever these
  levels are open. Sweep rewritten on typed arrays (127 → 31 ms, identical results).
  Tests: meters + losses = head and the substation closes, to 1 mW, at three times of
  day; the feeder's source is the transmission solution's 60 kV bus to 12 digits; the
  outlet sits in Range A. Critique: `docs/critique/phase-5.md`. 69 tests pass.
- **Phase 6 done.** Math panels as data (decision 0019). Each step shows:
  - the general form in standard notation;
  - the displayed values substituted, with units;
  - the result, computed from the displayed values and rounded as shown;
  - the solver's unrounded value beside it.

  Panels:
  - circuit or transformer: π-model flow (Glover);
  - place: a KCL check per bus, since Newton–Raphson is not closed form;
  - region: losses by difference, checked against the sum of branch losses;
  - substation: bank losses;
  - feeder: balance;
  - home: meter;
  - outlet: Ohm's law.

  A "Working" toggle (key W) in the inspector swaps the readout for its working.

  Tests:
  - the arithmetic-consistency test builds every branch, bus and region panel at
    19:00 and 12:30, plus the distribution panels on a coupled solve, and holds each
    displayed result to the solver within two units of its last place;
  - the harness re-evaluates every substituted line from the rendered page text and
    matches the printed result, on four views.

  Critique: `docs/critique/phase-6.md`. 73 tests pass; 26 screenshot views, all probes
  OK.
- **Phase 7 done.** Decision 0020.
  - **Moss Landing Unit 1 as a 2-on-1 combined cycle.**
    - It opens from Moss Landing's node on the System or the Central Coast region.
    - The drawing shows the switchyard, GSUs, isolated-phase bus, generators, gas turbines, HRSGs, stacks, steam turbine, and a seawater condenser.
    - Chevrons carry MW of fuel, heat, steam, shaft work and electricity at one scale.
    - Energy closes from fuel (HHV) to the 230 kV bus to under 1 mW at every interval it runs, with GSU losses equal to the power flow's own.
    - Calibrated to the data file's heat rate: 6 950 Btu/kWh at full load, gas turbines 38.1 % (LHV), steam cycle 33.8 %.
    - Dispatch splits the plant by what the exhaust heat allows. The steam turbine takes no slack.
  - **Machine level (gas turbine generator 1).**
    - A sectioned stator with rotor, exciter, shaft and neutral grounding.
    - The inspector shows phasors (round rotor, E_f = V_t + (R_a + jX_d)·I_a), a capability chart with the operating point and the power flow's Q limits, and sequence reactances.
    - "Raise / lower excitation" re-solves: +0.02 pu on the set-point took the unit from −14.0 to +23.6 MVAr.
  - **Trip the plant.**
    - The system frequency response runs from the interval as it stands: centre-of-inertia swing, per-unit reheat-steam, gas, hydro and battery governors, load damping, fixed-step RK4 at 10 ms.
    - At 19:00: nadir 59.927 Hz, settling at 59.965 Hz.
    - The power flow re-solves with the governors' pick-up. Its sharing matches the frequency model to 2 %.
  - **Validation.**
    - SMIB equal-area critical clearing angle and time match the scipy DOP853 fixture: 10⁻¹² on the angle, under 1 µs on the time.
    - The frequency model matches the exact linear solution to 10⁻⁸ Hz.
  - **Math panels.**
    - Plant: fuel to bus, with the check.
    - Machine: E_f and δ from terminal quantities.
    - Frequency: df/dt and the settled frequency in closed form; the nadir is marked as integrated.
  - Critique: `docs/critique/phase-7.md`. 99 tests pass; 35 screenshot views, all 31 probes OK (the other four are transition stills).
- **Phase 8 done.** Decision 0021.
  - **Symmetrical-component faults on the transmission network.**
    - Zero-sequence paths follow each transformer's windings; Δ–Y shifts are included.
    - Checked against OpenDSS on a textbook-class four-bus system (four fault types; currents, branch currents, voltages to 2×10⁻⁴ pu).
    - California fault levels: 10–27 kA at 500 kV, 34–48 kA at 230 kV, 12 kA at Evergreen 60 kV. The study builds in about 20 ms.
    - A place's inspector shows its buses' fault levels, with the working.
  - **Phase-domain feeder faults**, checked against OpenDSS's IEEE 13 short-circuit matrices.
  - **Protection on feeder 1105:**
    - breaker relay on IEEE C37.112 curves (50/51/50N/51N);
    - 2F2S recloser;
    - 100T lateral fuses.

    It is simulated as a time-stepped sequence, played on the sheet in real time: fault-current chevrons, devices opening, and sections without supply in the signal colour. A time–current chart and an event timeline sit in the inspector.
  - **After the sequence:** a real coupled re-solve with the devices open. For example, after FU-L10 clears, 43 homes are out and meters plus losses still equal the head.
  - **Coordination test:** every permanent fault is cleared by the nearest device, and the CTI of at least 0.3 s holds. Fuse saving holds where the current allows.
  - Critique: `docs/critique/phase-8.md`. 129 tests pass; 38 screenshot views, all 34 probes OK (the other four are transition stills).
- **Phase 9 done.** Decision 0022.
  - **"What's simplified".**
    - On every level, fed from `docs/simplifications.md` at build time.
    - Sections follow the level and what the reader has done.
    - A test keeps the document and the app in step.
  - **A searchable glossary.** Clicking any term opens it.
  - **A guided route of thirteen stops:** from the whole state through noon's duck, a tripped line, a region, the substation, the feeder, the outlet, the plant, the generator, a plant trip and a feeder fault, to the honesty panel.
    - Each stop sets its own scene from wherever the sheet is; Back, Next and Resume all work.
    - A harness view walks every stop with provenance checked at each.
  - **IEEE 1366 reliability indices**, checked on hand-worked records.
    - A seeded twenty-year fault record on feeder 1105 runs through the protection sequence.
    - The feeder's inspector shows SAIFI, SAIDI, CAIDI and MAIFI_E, and what fuse saving trades.
  - Critique: `docs/critique/phase-9.md`. 135 tests pass; 42 screenshot views, all 38 probes OK (the other four are transition stills).
- **After the phases: one continuous zoom** (the author's review: nodes could not be zoomed into, the Region's layers rose on double-click, the levels felt disconnected). Decision 0023.
  - **Every node unfolds where it is, as the reader zooms.** Scroll, pinch or `+`/`−` scrub the unfold both ways; nothing is timed. At full unfold the sheet is handed to the child's own frame without anything moving; zooming out hands it back.
  - **The levels above stay drawn around the one on the sheet**, receding in ink. A System circuit into a station ends where the station's own stroke takes it up.
  - **A Site level for every System node:** the yard drawn from the network data — buses, bays, banks, plants, demand, capacitors — with circuits leaving on their true bearings.
  - **The tree follows space:**
    - System → station;
    - Moss Landing → Unit 1 → each generator;
    - Evergreen → its neighbourhood → the substation, or any service.
  - **All levels share the System's orientation.** The neighbourhood grows down its streets; yards grow out of their buses.
  - **Double-click, Enter, "Zoom inside", Esc and the breadcrumbs** fly the same zoom.
  - **The Region's layers are now a lens** opened from a place's inspector.
  - **Tour and harness:** the tour has a stop for "every node is a place"; the harness has views held part-way through each unfold.
- **Detail where one zooms in** (the author's second review: lines that did not connect; more substation detail). Decision 0024.
  - **An equipment kit, with every conductor run terminal to terminal**, in three phases inside a yard: insulators, disconnects, dead-tank breakers, gantries, lattice towers, transformers.
  - **Plants face their bays**, each reached over a span to its step-up transformer, and drawn by kind.
  - **Evergreen's substation rebuilt with the kit.**
  - **Homes shared by the feeder and service levels:** pitched roofs, doors, meters, rooftop panels.
  - **The key shows each piece of equipment as a small drawing;** new glossary terms (disconnect, insulator, bushing, gantry).
- **Components opened up** (the author's third review: zoom into individual components and see how they work, visually). Decision 0025.
  - **A Transformer level inside every bank:** zoom into any yard's transformer, or Evergreen's bank, and the tank opens on the plane through its limbs.
    - Inside: the core's sheets; the windings in section, turns drawn in the ratio of their voltages; the leads; the tap changer and its dial (Evergreen).
    - Flux arrows alternate at a stated slowed 60 Hz, sized by the solved voltage.
    - Chevrons carry the solved loss round the oil's loop.
  - **The inspector explains it in four steps** with live numbers, and each part picked says what it is for.
  - **A transformer math panel** (currents from S = V·I*, their ratio against the turns ratio, the loss as P_H + P_L and as 3I²R). It is in the arithmetic-consistency test for every transmission bank and for Evergreen.
  - **Honesty, glossary and key:** a new "transformer" section in the honesty panel; glossary terms core, winding, turn, flux, turns ratio, conservator, radiator, tertiary and eddy current; key rows for the cutaway.
  - **A Breaker level at every circuit's bay,** its nearest pole cut open: fixed contact and arcing pin, moving contact and nozzle, puffer, operating rod. The current transformers and operating mechanism were added to the kit for every yard.
    - "Open the breaker" plays the real sequence, slowed by a stated factor: main contacts part, then the arcing contacts; the arc burns, gas is blown through the nozzle, and the arc goes out at each phase's current zero.
    - Then the network is solved without the circuit. Closing plays the reverse.
    - A chart shows all three phase currents through the opening, with a cursor that follows it.
  - **A breaker math panel:** current, peak, current angle, and each phase's clearing time from the current zeros. It is in the arithmetic-consistency test for every line end.
  - **Fix: the state map's land surface could blank a deep view.** It is no longer drawn once the map has receded.
  - **Guided route:** two new stops, "Inside a transformer" and "A breaker opens".
  - Critique: `docs/critique/components.md`.
