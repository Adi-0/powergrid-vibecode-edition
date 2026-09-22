# 0001 — Stack and dependencies

**Chosen.** TypeScript, three.js, Vite, Vitest, Playwright. Static build, no backend,
no runtime network requests.

| Dependency | Kind | One-line justification |
|---|---|---|
| `three` | runtime | Required by the brief; WebGL scene graph, cameras, shader materials. |
| `typescript` | dev | Required by the brief; strict typing keeps units and provenance honest. |
| `vite` | dev | Bundles TS, workers, fonts and data into a static site that opens from any URL. |
| `vitest` | dev | Runs the solver fixtures and consistency tests in Node with the same TS config. |
| `@playwright/test` | dev | Headless Chromium for the screenshot harness and in-browser tests. |
| `@types/three` | dev | Type definitions for three.js. |

Offline-only Python (not shipped, not a build dependency; `tools/ref/`, `tools/font/`):
`pandapower` (reference AC power flow for IEEE 14/30 fixtures, and the tool the brief
names), `opendssdirect.py` (independent unbalanced distribution solution for
cross-checking the IEEE 13-node fixture), `fonttools` (building the subset typeface).

**Rejected.** A UI framework (React/Svelte): the UI is a handful of panels over a
canvas; a framework adds weight and indirection without paying for itself. KaTeX for
maths: it brings a second typeface (Computer Modern) — the brief allows one; the
maths renderer is written against the one typeface instead. A YAML parser for data
files: see 0003.

**Why.** Smallest set that meets the brief; each piece is load-bearing.
