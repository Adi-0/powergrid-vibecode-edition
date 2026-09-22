# Progress

Current phase: **2 — Distribution solver + coupling**

| Phase | State | Done-condition |
|---|---|---|
| 0 Setup | done | Screenshot of a test scene shows visible line work |
| 1 Transmission solver + network | done | IEEE 14/30 pass; synthetic net converges 24 h; balance holds |
| 2 Distribution solver + coupling | — | IEEE 13 passes; energy closes across boundary |
| 3 System view | — | 60 fps full network; legend complete; critique recorded |
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
