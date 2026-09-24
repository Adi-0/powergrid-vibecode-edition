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

**Rejected.**
- *A lid that folds away as the zoom proceeds.* The renderer unfolds shapes out of a
  point; it cannot fold a panel about an edge. A wall that shrinks to a point reads as a
  glitch. The cut appears as the band starts, while the tank is still small.
- *Showing the currents as ⊙/⊗ marks in the section.* It is standard notation, but it is
  one more layer on a busy section; the inspector says it in words for now.
- *A separate "exploded" diagram beside the drawing.* The picture teaches first, in
  place.
