# 0025 — Components opened up: how a thing works, shown working

**Why.** The author, after 0024: "The end goal should have a fully immersive, visually
accessible, and interconnected system. We want to start zooming in on individual
components in diagrams to see and understand them better, visually. How they work,
why, etc. (without making a messy word salad, but by intuitive teaching and visuals)."
The zoom tree ended at a yard's equipment drawn from outside. The next level down is
the inside of a piece of equipment, working, driven by the solved state.

**Chosen.**
- *A component is a level, opened where it stands.* Zooming into a transformer bank in
  any yard (or Evergreen's bank in its substation) unfolds a Transformer level in the
  yard's own frame (seat = anchor, ratio 1), so nothing moves at the hand-off. The yard
  hides its copy of the bank while the level is open, and the level draws the shell in
  exactly the same place, never folding. The inside unfolds from the tank's centre.
- *The cut.* The tank is cut on the vertical plane through its three limbs, which faces
  the viewer at 45°. Everything on the near side of the plane is reduced to a light
  outline, with no faces: the near walls, the lid, and the near halves of the radiators.
  The far walls stand, with their cut edges drawn heavy. The section shows:
  - the core's steel sheets, with their mitred joints;
  - each winding's turns as blocks.

  Behind the section, the far halves of the windings stand as half-rings.
- *Drawn by physics, not decoration.*
  - Turns are drawn in the ratio of the windings' voltages. Every turn on a limb links
    the same flux, so volts per turn is common to all the windings.
  - Every main winding has the same radial build, because the ampere-turns balance. A
    turn's cross-section is therefore in proportion to its current: the high-voltage
    winding has many thin turns and the low-voltage winding few thick ones.
  - The windings on each limb follow the vector group: a delta tertiary innermost; the
    common and series windings of an autotransformer; the tapped winding at Evergreen,
    one block per step.
- *Three things move, each a solved quantity:*
  - **Flux.** Arrows in the limbs and yokes alternate at 60 Hz shown 120 times slower
    (stated in the key). One phase is on each limb, a third of a cycle apart. The yokes
    carry the sums, which close through one another. The arrows' size follows the
    high-side voltage (flux ∝ V/f), not the load. They stop when the bank is out of
    service.
  - **Heat.** Chevrons in kW carry the solved loss along the oil's loop: up the ducts,
    over the top, down the radiators, back along the bottom.
  - **The tap changer's dial.** At Evergreen, it shows the tap position the coupled
    solve chose.
- *The inspector teaches in the drawing's order*, one sentence per step, each with its
  live numbers:
  1. voltage drives a flux (|V_H| and flux as a share of rated);
  2. the same voltage in every turn (each winding's voltage, the drawn turns, the ratio);
  3. current flows the other way (I_H, I_L, and the common winding's difference in an
     autotransformer);
  4. what is lost warms the oil (the loss and the loading).

  Each part picked (the core, a winding, bushings, radiators, the conservator, the tap
  changer, the tank) says what it is for, with its own numbers.
- *The working.* A new math panel (`transformerPanel`) derives the current at each
  terminal from S = V·I* (|I| = |S| / (√3 |V|)). It checks their ratio against the turns
  ratio, which is exact here: the model has no magnetizing branch, and it says so. It
  finds the loss twice, as P_H + P_L and as 3I²R. At Evergreen the unbalanced feeder
  makes the last two approximate, marked as such with a tolerance. Every transmission
  bank's panel and Evergreen's are in the arithmetic-consistency test.
- *Perturbation.* A bank can be taken out of service from inside it (a real re-solve).
  The flux and the oil stop, and the other banks take its share. The time of day moves
  the loss, and at Evergreen the tap.
- *Honesty.* A new "transformer" section covers:
  - the series-only model (no core loss, no magnetizing current);
  - the schematic core-form design and the drawn turns;
  - 500 kV banks drawn as one three-phase tank rather than three single-phase units;
  - the unloaded tertiary and its typical voltage (a new data field, marked as an estimate);
  - the flux shown slowed, with no saturation;
  - the oil loop without temperatures;
  - Evergreen's near-balanced phases.
- *Kit changes that serve the cut.* The radiators moved to the tank's ends and the
  conservator runs across the lid at the far end, so nothing stands between the viewer
  and the section. Evergreen's bank now has its phases along its long side. The tap
  changer's motor drive is a cabinet on the low-voltage side.

- *A Breaker level at every circuit's bay* (in every yard, and the three 60 kV circuits
  into Evergreen). It opens in place like the transformer. The pole nearest the viewer
  has its tank cut open; the other two stand whole. Along the axis:
  - the conductor down from the first bushing to the fixed contact: fingers round an
    arcing pin;
  - the moving contact, a nozzle round its mouth, and the puffer cylinder behind it,
    all drawn on a group of their own that slides along the axis;
  - the insulating operating rod out to the crank at the tank's end.

  Outside: each bushing stands on the pod of its current transformers (what protection
  measures), and a gang shaft runs from the cranks to the operating mechanism's cabinet.
  These were added to the kit, so every yard shows them too.
- *Opening is the perturbation, played in its real order.* "Open the breaker" runs the
  sequence 120 times slower (stated in the key):
  1. the trip releases the spring;
  2. the main contacts part, then the arcing contacts, and an arc strikes across the
     widening gap;
  3. the gas blast shows in the nozzle;
  4. the arc goes out at the phase's current zero, and the contacts run on to fully open.

  The timings are typical values for the three-cycle class (data, marked as estimates).
  When the contacts are home, the network is solved again without the circuit: the
  sequence is a depiction of real timings, and the consequence is the real re-solve.
  Closing plays the reverse, then restores the circuit. A sequence left behind (the
  reader zooms away, or the guided route moves on) is dropped, not acted on. With
  reduced motion the re-solve happens at once.
- *The chart shows what the drawing cannot.* It plots all three phase currents, at the
  solved magnitude and angle, through the opening, with the trip, the contacts parting,
  the arcs (shaded), and each phase clearing at its own first zero after the shortest
  arc the gas can put out. A cursor follows the playing sequence.
- *The working (`breakerPanel`).* The steps are:
  - |V|, |S|, and I = |S| / (√3 |V|);
  - I_peak = √2 I;
  - phase a's current angle θ_I = θ_V − atan(Q/P), taking half a turn when P is negative;
  - the half cycle 1/(2f);
  - each phase's clearing time (n·180° − θ)/(360° f);
  - the rated interrupting time.

  Every line's breaker at both ends is in the arithmetic-consistency test.
- *Honesty:* a "breaker" section covers:
  - typical timings and schematic proportions;
  - each pole clearing as if the others were unaffected, with no arc voltage or
    recovery voltage modelled;
  - opening one end takes the whole circuit out (no node–breaker model);
  - the trip drawn at a chosen point on the wave.
- *A precision fix found on the way.* The state map's land surface is one rectangle as
  big as the state. From a frame a thousand times finer, its clipped depth could land in
  front of everything and blank the view. It is no longer drawn once the map has receded.

- *A Pole-top level in every service.* The last transformer before the home, opened
  the same way (the can cut on its axis):
  - a shell-form core of two wound loops;
  - the coil in section, with the turns in their real ratio (7200 V to each 120 V half:
    sixty to one), so the secondary's turn is sixty times the primary's in
    cross-section;
  - the terminals by their standard names: H1 in from the lateral, H2 to the tank, X1
    and X3 the legs, X2 the grounded centre tap that becomes the neutral.

  The feeder snapshot now carries each branch's per-phase currents, so the legs' and
  the neutral's currents are the solve's own. The math panel shows the centre-tap
  arithmetic in rectangular phasors:
  - |V₁₂| = |V₁ − V₂|;
  - |I_N| = |I₁ + I₂|;
  - |I_p| = |I₁ − I₂| / n, which is exact in this model;
  - P = Re(V·I*) per leg;
  - the loss by conservation.

- *A Span level at every corridor out of a yard.* A line's rating is the one number in
  the power flow that a reader cannot see: it stands for how hot the conductor may run,
  and so how far it may sag. Zooming into the first span of any corridor unfolds it in
  place, from the tower outside the yard to the next one along the corridor's bearing.
  - *The physics is IEEE 738's steady-state heat balance*, q_c + q_r = q_s + I²R(T_s)
    (`src/physics/ieee738.ts`). Its inputs are:
    - the solved current per phase (from the circuit's end at this yard), split across
      the bundle's sub-conductors;
    - the hour's air temperature for the station's region;
    - the sun's position at the station for the interval;
    - the line's azimuth for the angle of incidence;
    - a wind the reader chooses: still air, the light 0.61 m/s crosswind that line
      ratings assume, or a breeze.

    The temperature is found by bisection, a converged iteration and not a closed form,
    so the residual is shown. The implementation reproduces the standard's worked
    example (Drake ACSR at 100 °C, about 1025 A), term by term, in
    `test/ieee738.test.ts`.
  - *Sag follows from that temperature*: a change of state from an everyday reference
    (15 °C, a fifth of breaking strength). The model is linear elastic on a level span,
    with the parabola's length and tension. The drawing draws it:
    - each phase's conductor is a parabola whose sag is the solved one;
    - a dashed ghost hangs where the conductor would be at its temperature limit;
    - a dimension gives the clearance to the ground.
  - *In the isometric view a span can run nearly toward the viewer*, with its sag seen
    edge-on. The inspector therefore carries a side elevation (heights exaggerated by a
    stated factor), a temperature–current curve with the ampacity marked, and a
    sag–temperature curve, each with a dot for now.
  - *The working (`spanPanel`)* covers every term of the balance:
    - the film temperature and the air's density, viscosity and conductivity;
    - the Reynolds number;
    - both forced-convection correlations and natural convection, taking the largest;
    - radiation and solar gain;
    - I²R at the conductor's temperature;
    - the residual;
    - the sag D = wS²/(8H).

    Every line span in all three winds is in the arithmetic-consistency test.
  - *Honesty:* a "span" section covers:
    - steady state for the interval, not IEEE 738's transient;
    - the change of state without creep, ice or wind load;
    - schematic towers on flat ground;
    - the fixed rating in the power flow, which the temperature does not feed back into.
- *A fix found on the way: the child zoomed toward keeps the sheet.* With spans of
  different lengths unfolding side by side, a longer one became whole first and took the
  sheet, even though the reader was zooming toward a shorter one. The hand-off now waits
  while the band nearest the focus is still unfolding.

**Rejected.**
- *A lid that folds away as the zoom proceeds.* The renderer unfolds shapes out of a
  point; it cannot fold a panel about an edge. A wall that shrinks to a point reads as a
  glitch. The cut appears as the band starts, while the tank is still small.
- *Showing the currents as ⊙/⊗ marks in the section.* It is standard notation, but it is
  one more layer on a busy section; the inspector says it in words for now.
- *A separate "exploded" diagram beside the drawing.* The picture teaches first, in
  place.
- *Animating the breaker's opening at real speed.* Fifty milliseconds is invisible;
  slowed, with the factor stated, the order of events is the lesson.
- *All three poles cut open.* One pole shows the mechanism; the chart carries the three
  phases, which is where they differ.
- *A catenary instead of the parabola for sag.* The catenary's sag exceeds the
  parabola's by about 4D²/(3S²) of itself. With the sag a few percent of the span, that
  is a fraction of a percent. The parabola keeps the hand arithmetic to one line,
  D = wS²/(8H).
- *Feeding the conductor's temperature back into the power flow* (resistance rising with
  temperature, dynamic ratings). It would couple every interval's solve to the weather
  model; it is named in the honesty panel as the full treatment instead.
