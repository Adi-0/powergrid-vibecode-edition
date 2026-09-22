# Grid Atlas — invariants

An isometric, zoomable, explorable model of the California power grid. It teaches
someone who knows nothing about electricity how a power system works **by letting
them look at one**. The picture teaches first; text is a second layer to pull on.

This file distils the build brief. Re-read it at the start of every phase. When a
rule here conflicts with convenience, the rule wins. When the brief is ambiguous,
choose what best serves the goal, record it in `docs/decisions/`, and continue —
never stop to ask.

## The two rules that decide whether this is worth building

1. **Standard notation, exactly as the field uses it.** IEEE/ANSI where they exist:
   ANSI C84.1 voltage ranges; ANSI/IEEE C37.2 device numbers (50, 51, 87, 21, 27,
   59, 81); standard vector-group notation; `S = P + jQ`, `V∠θ`, `Z = R + jX`,
   `Y = G + jB`, `δ` rotor angle, `φ` power-factor angle. **Never invent friendly
   renames or simplified symbols.** Plain language *alongside* notation — both,
   never one instead of the other.
   - Phasor magnitudes are **RMS** unless explicitly marked peak.
   - Every voltage is labelled **line-to-line (LL)** or **line-to-neutral (LN)**.
   - Every power is labelled **three-phase (3φ)** or **per-phase (1φ)**.
   - Complex power is `S = V·I*` (current conjugated) — say so where first used.
   - Load-reference convention at loads, generator-reference at sources, and the
     convention is drawn.
   - Angles display in degrees; radians only inside math that requires it, labelled.
2. **Every number is reproducible by hand.**
   - Math panel = general form → substituted values → arithmetic → result with units.
   - Displayed precision supports reproduction: displayed inputs + displayed arithmetic
     reach the displayed result at its displayed precision. Carry enough significant
     figures on intermediates.
   - A converged Newton–Raphson state is not closed-form: say so and show the check
     (plug values back in, mismatch ≈ 0).
   - Reference directions / sign conventions drawn on every branch where a quantity
     could go either way.
   - Per-unit never without its base; per-unit and physical units side by side.
   - Intermediate quantities exposed: if a line flow is visible, so are both end
     voltage phasors, the impedance, the current and the losses.

## Audience

No engineering background, curious, intends to understand. Therefore:
- **No unglossed jargon.** First appearance of a term anywhere in the UI carries a
  one-line plain definition (hover) and lives in a searchable glossary.
- Every quantity carries **symbol, unit, and a sense of scale** ("500 MW ≈ what that serves").
- Nothing requires reading to be useful; everything rewards reading further.
- No forced prerequisite path; any entry point makes sense on its own.
- Accessible: the signal colour is always paired with a shape/pattern. Pan, zoom,
  select via keyboard, mouse, trackpad, touch.

## Accuracy stance — physically faithful, not asset-accurate

Must be true: real equations in standard form; dimensionally correct, realistic
ranges; **conservation everywhere, every time** (generation = load + losses to solver
tolerance, at every level, including across the transmission↔distribution boundary);
cause and effect are real re-solves, **never scripted animation**; canonical equipment
parameters for their class.

Allowed: synthetic California network of ~40–80 transmission buses named after real
places (never claimed a replica), broadly N-1 secure at peak with one or two
deliberately tight corridors; positive-sequence balanced transmission; one or two
fully modelled feeders; schematic-but-plausible parametric geometry; a bundled
public-domain state outline (no runtime fetch).

**Model honesty is a UI feature**: every view has a quiet, always-available control
showing what is simplified here and what the full treatment would involve. It is fed
from `docs/simplifications.md` — keep them in sync.

## Physics that must be done right

- Transmission: Newton–Raphson AC power flow, positive sequence, **distributed slack**
  by participation factor (droop × headroom). Single slack bus is taught as the
  textbook simplification (in the honesty panel).
- Distribution: **unbalanced three-phase backward/forward sweep**, full phase
  impedance matrices (Carson + Kron), wye/delta loads, regulators, capacitors.
  Validated on the IEEE 13-node feeder.
- T–D coupling: feeder source voltage from its substation bus in the transmission
  solution; feeder 3φ demand + losses returned as that bus's load; iterate to
  agreement; energy closes across the boundary.
- **No solution is an answer**: islanding or voltage collapse → never show the last
  good solution, never crash; say honestly that no steady-state operating point exists
  and what that means physically.
- Time is **quasi-static**: the scrubber runs economic dispatch + power flow per
  interval, respecting ramp rates. The UI says so. Dynamics (frequency after a trip,
  rotor swings) are separate time-domain models.
- Every line, transformer, machine carries **positive, negative, zero-sequence**
  data; transformer zero-sequence paths follow winding connection and grounding.
- Protection: IEEE C37.112 inverse-time curves (MI, VI, EI); realistic coordination
  time interval between series devices.
- Dynamics: swing equation and aggregate system frequency response with a **stated
  fixed-step integrator**; show the frequency nadir.

## Validation — checked against known answers, not asserted

Fixtures precomputed offline with an established open-source tool (pandapower /
MATPOWER data; OpenDSS where useful), committed, tool + version recorded. Tolerances
match the reference's real precision. IEEE 14 & 30 bus (transmission PF); IEEE
13-node (distribution); a textbook fault example reproduced exactly; SMIB equal-area
critical clearing angle; IEEE 1366 reliability indices. Source families named in
`docs/model.md` (Glover/Overbye/Sarma, Grainger & Stevenson, Kersting, Kundur,
Blackburn; C84.1, C37.2, C37.112, IEEE 738, IEEE 80, IEEE 1366). **Never fabricate
page numbers or table references.** Unsure a value is canonical → mark it an estimate.

## Visual direction — a precision instrument, not a landing page

Reference: technical drawing — patent illustration, axonometric section, cutaway.
- Ground `#EFECE4`, ink `#14161A`. Slight paper tooth at close zoom only.
- **Voltage class = line weight + dash pattern, never hue.** Weight scale:
  500 kV heaviest → 230 → 115 → 60–70 kV subtransmission → 12–21 kV primary → 120/240 V.
- **One signal colour, one meaning: something is wrong** (over limit, out of range,
  fault, load shed, no solution). Always paired with a pattern/mark. Used rarely.
- One typeface, engineering register; tabular figures on live readouts; no monospace
  costume for labels.
- Standard one-line symbology.
- **No gradients, glows, drop shadows, rounded cards.** Depth from line weight and occlusion.
- Motion only when it carries information (flow ∝ MW, transitions showing what changed,
  protection in real sequence). No entrance animations, no hover flourishes.
- Legend always present, always correct, always complete.

## Rendering rules

- `gl.lineWidth` is ignored: **instanced quad lines**, constant screen-space width.
- Hidden-line removal: ground-coloured faces with polygon offset behind strokes.
- ~7 orders of magnitude of zoom: **each level has its own local coordinate frame**;
  transitions are hand-offs between frames.
- Labels in screen space with collision-avoiding layout; never 3D text.
- LOD: system view pans at 60 fps with the full network.
- Orthographic camera, azimuth 45°, elevation atan(1/√2) ≈ 35.264° — one tunable constant.

## The zoom tree and the transitions

System → Region → Substation → Distribution feeder → Service (ends at the wall outlet);
System → Plant → Machine. Math is a panel bound to the current selection, not a level.
**The transitions are the lesson**: zooming out, machinery visibly collapses into the
labelled node it occupies above; zooming in, it unfolds. Every level boundary gets one;
legible, slow enough to follow, reversible.

**Perturbation is the other lesson**: trip a line, move time of day (duck curve
*emerges*), take a plant offline (frequency dip, who picks up), switch a capacitor,
change excitation (move along capability curve), fault a feeder (protection in sequence).
Every concept must exist as a visible, manipulable object — prose alone means not built.

## Engineering rules

- Static web app, no backend, **no runtime network requests**. TypeScript + three.js.
  Solvers in TS in the browser; move off main thread if a solve drops a frame.
- Network, equipment, machine parameters live in versioned, human-readable data files,
  documented, each value traceable to a source family (`docs/model.md`).
- **Every displayed number passes through the display layer with a provenance
  reference** (solver output or data-file key). Numeric literals never reach rendering.
  A test fails on any displayed quantity without provenance.
- A test checks every math panel's displayed arithmetic reproduces its displayed result.
- No dependency without a one-line justification in `docs/decisions/`.
- Depth-first build. Commit at the end of every phase; don't advance until the phase's
  done-condition holds. Keep `PROGRESS.md` current.
- Screenshot renders and critique against the visual direction before advancing a
  phase; a generic-dashboard look means rebuild.
- Stuck for long: write down what was tried, take the simplest physically-correct
  route, record a known limitation, move on. **Never fake values or script behaviour.**

## Phases (done-conditions)

0. Setup — screenshot of a test scene shows visible line work.
1. Transmission solver + synthetic network — IEEE 14/30 pass; synthetic net converges
   every interval of 24 h; balance holds.
2. Distribution solver + coupling — IEEE 13 passes; energy closes across the boundary.
3. System view — 60 fps at full network; legend complete; screenshot critique recorded.
4. Time scrubber, line tripping, region view, first transition — every interval
   re-solves live; any trip → correct solution or honest no-solution.
5. Substation → feeder → service — outlet voltage traceable to transmission bus;
   meters + losses sum to feeder head.
6. Math panel everywhere — arithmetic-consistency test passes on every panel.
7. Plant + machine (one CCGT) + system frequency response — plant energy closes;
   SMIB equal-area fixture passes.
8. Faults + protection — textbook fault fixture passes; coordinated sequence.
9. Breadth + guided path (skippable, re-enterable ~10-minute narrated route).

## Commands

- `npm run dev` — dev server; `npm run build` — typecheck + production build
- `npm test` — unit + fixture tests (vitest)
- `npm run shots` — headless Chromium screenshots into `screenshots/`
- `tools/ref/` — offline Python scripts that regenerate fixtures (pandapower/OpenDSS)
