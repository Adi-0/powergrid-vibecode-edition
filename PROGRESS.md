# Progress

Current phase: **1 — Transmission solver + synthetic network**

| Phase | State | Done-condition |
|---|---|---|
| 0 Setup | done | Screenshot of a test scene shows visible line work |
| 1 Transmission solver + network | — | IEEE 14/30 pass; synthetic net converges 24 h; balance holds |
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
