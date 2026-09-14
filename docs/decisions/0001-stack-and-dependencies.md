# 0001 — Stack and dependencies

**Status:** accepted · **Phase:** 1

## Chosen

TypeScript, three.js, Vite, Vitest. Static site, no backend.

Every dependency, with its one-line justification (the brief requires one):

| Package | Why |
|---|---|
| `three` | WebGL scene graph, orthographic camera, and instancing. Writing raw WebGL for an isometric renderer with hidden-line removal would be weeks of work that teaches the reader nothing about power systems. |
| `vite` | Dev server and static build. Zero-config TypeScript, and the output is plain files on a CDN. |
| `typescript` | The solver's correctness depends on units and types not being confused. |
| `vitest` | Test runner that shares Vite's module resolution, so tests import the same source the app does with no separate build. |

Nothing else. In particular **no** maths library (the linear algebra needed is one
LU factorisation, written out in `src/core/linalg.ts` so a reader can follow it),
**no** UI framework (the interface is a handful of panels over a canvas; a
framework would add a layer between the reader and the DOM for no gain), and
**no** charting library (the plots are small, specific and must match the visual
language exactly, which is easier to guarantee by drawing them than by fighting
a library's defaults).

## Rejected

- **A backend with a Python solver.** Faster to write, and `pandapower` would have
  given validated power flow for free. Rejected because the brief requires a
  static site that works from a URL, and because a solver the reader cannot open
  and read undermines the whole claim of the project.
- **React.** Would make panel state easier. Rejected on dependency weight for an
  app whose interface is mostly a canvas.
- **A maths/linear-algebra package.** Rejected because dense LU on a 400×400
  matrix is forty lines, and those forty lines are inspectable.

## Consequences

All numerical work runs in the browser on the main thread. Solve times are
~5–15 ms for the 68-bus network, which leaves ample headroom for interactive
perturbation. If the distribution feeder pushes the case past a few hundred
buses, the solver moves to a worker rather than to a server.
