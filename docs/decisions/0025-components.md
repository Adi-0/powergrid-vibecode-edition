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

- *A Capacitor bank level, and inside it a Can level.* Reactive power is the idea
  readers find hardest, and switching a capacitor is one of the brief's named
  perturbations. So a capacitor bank opens in two steps, both in place.
  - *The bank (every yard's switched shunt capacitors).* The yard now draws the bank as
    it is built:
    - a row of steps along a short bus on post insulators, each step with its own switch;
    - each step three stacks of cans, one per phase, on insulated tiers: series groups
      of parallel cans, the tiers wired in series up the stack;
    - each step's stack bottoms joined at a grounded neutral.

    The construction is a plausible design for the voltage class (an estimate). Each
    can's rating follows from the step's: its share of the phase voltage and of the kvar.
  - *Steps in and out come from the solution.* The snapshot now carries every bank's
    steps in service. A step switched out is drawn light, its switch blade hanging open.
    The reader can switch steps from the inspector ("Switch a step out / in", "Back to
    the controller"). This holds that bank's steps in the solver (a new
    `shuntHold` option, which the voltage controller then leaves alone), and the network
    is solved again. The inspector then compares the voltage, the bank's Q and the
    system's losses before and after, each value from its own solve.
  - *What moves is energy.* A capacitor takes no net power. Each phase's instantaneous
    power, p(t) = v(t)·i(t) from the solved phasors, runs as chevrons on that phase's bus,
    slowed 120 times. They reverse twice a cycle, and the three phases together sum to
    nothing at every instant. A chart shows v, i (a quarter cycle ahead) and p per phase
    with their heavy, flat sum, plus the phasors, with a cursor that follows the drawing.
  - *The can.* Zooming into the nearest can cuts it open on the plane through its
    terminals. Inside:
    - the pack of flattened elements in section, and the discharge resistor across the
      terminals;
    - one element drawn out of the pack, the end of its winding unrolled into two foil
      plates with film between (the gap drawn thousands of times wider).

    Moving with the solved voltage across that can: + and − marks on the plates' facing
    sides, which swap every half cycle; field arrows in the film, from + to −, as long as
    the field is strong; energy chevrons along the terminals, in and then out. This is
    the classic parallel-plate picture, reached from the real construction rather than
    drawn beside it.
  - *The working.* `capBankPanel` runs:
    - ω = 2πf;
    - the step's capacitance per phase, C = Q_step / (3ωV_LN²);
    - Q = n·Q_step·V_pu² (exactly the power flow's shunt);
    - |I| = Q/(√3|V_LL|), with θ_I = θ_V + 90°;
    - the energy per phase at the peak, W = n·C·V_LN²;
    - the check Q_1φ = ωW.

    `canPanel` runs C_can = C·S/P, the can's voltage, current and kvar, then the
    largest discharge resistor meeting IEEE 18 (to 50 V within 5 minutes from the rated
    peak): R = t / (C ln(V_0/V_1)), and τ = RC. The math gained `ln`. Every bank and its
    can are in the arithmetic-consistency test; `test/capacitor.test.ts` checks:
    - Q against the power flow's shunt;
    - the hold, and the voltage following it;
    - the waveforms (the quarter-turn lead, the three phases summing to zero, the peak
      of p equal to Q_1φ);
    - the can's arithmetic and the discharge rule.
- *A Regulator level for feeder 1105's step-voltage regulator.* It opens from the
  regulator's symbol on the trunk. Three single-phase units stand on a platform beside
  the line:
  - the line is carried down to each unit's source bushing (S) and back up from its load
    bushing (L);
  - bypass switches, open, sit on the crossarm;
  - the control cabinet hangs on the pole;
  - each cover carries a position dial whose hand shows that phase's solved tap.

  The unit nearest the viewer is cut open on the plane through its axis. Below: the
  core, the shunt winding, and the series winding with a tenth of its turns in eight
  tapped sections. Above, face-on behind the cut, the tap changer:
  - the selector's eight contacts and neutral on an arc;
  - two fingers, on one tap or bridging two, at the position the feeder solve chose;
  - the preventive autotransformer that gives the half steps;
  - the reversing switch, turned to raise or lower.

  A change of tap between intervals is made one step at a time, as the mechanism makes
  it (the step's pace is a display choice).
  - *The lesson is in the inspector's chart*: each phase's voltage along the trunk on the
    control's base, falling with distance and stepping up at the regulator, with the band
    the control holds and the point its line-drop compensation sees. A second small
    diagram draws the compensation: the output through the PT, less the compensator's
    drop (magnified), is the load centre's voltage.
  - *Perturbation.* "Raise / Lower the set point" moves it a volt on the control's base.
    The value travels with the solve request (`regVset`) into the feeder solve, the taps
    follow, and the voltage beyond the regulator with them: a real re-solve.
  - *The working (`regPanel`, per phase)*:
    - the ratio a = 1 + (step/100)·tap;
    - |V_L| = a|V_S|, exact in the model (the sweep applies it so);
    - the PT voltage's real and imaginary parts;
    - the compensator's drop, (R′ + jX′)·I / CT_P, in parts;
    - |V_relay|, and its distance from the set point, which is inside half the bandwidth
      when no tap change is due.

    Every phase is in the arithmetic-consistency test. `test/regulator.test.ts` checks
    that each phase ends inside its band, that the output is the ratio times the input,
    and that raising the set point raises the taps and the voltage beyond.
  - *Honesty:* a "regulator" section covers the ideal ratio (a real Type B regulator's is
    1/(1 − 0.00625·tap), within about one percent), the control acting without its time
    delay, and the schematic construction.
- *A correction found on the way: shunt reactors were drawn as capacitor banks.* Every
  500 kV bus's switched reactors carried the yard's capacitor rack and its label. They
  are now three single-phase oil-filled units per step, labelled as reactors, switched
  like the capacitors (and at the evening peak, correctly, all out).
- *Two zoom fixes.*
  - A level's anchor can now stand above the ground (a can up in its rack): the camera
    places it by the ground point that projects to the same spot on screen.
  - Only the child being zoomed toward shows its part names while it unfolds. A larger
    neighbour that is nearly whole sooner no longer scatters its labels over the sheet.
  - Climbing out of a small level (a can, a bank) left the camera at a yard zoom where a
    long span nearby was already whole, and the sheet went straight into the span. Now
    nothing takes the sheet after a climb until the reader zooms again, and only a child
    near where the reader is looking can take it at all.

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
- *Showing a capacitor's charge as current arrows alone.* The current is the charge
  coming and going; the plates, the charge on them and the field between them are what
  a capacitor is, so they are drawn, and the current is in the chart.
- *Drawing every can of every step cut open.* One can carries the inside; the bank
  carries the arrangement.
- *Feeding the conductor's temperature back into the power flow* (resistance rising with
  temperature, dynamic ratings). It would couple every interval's solve to the weather
  model; it is named in the honesty panel as the full treatment instead.
