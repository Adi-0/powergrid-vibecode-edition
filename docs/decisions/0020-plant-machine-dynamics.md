# 0020 — Plant, machine and system dynamics

**Chosen.**
- *Moss Landing Unit 1 as the one combined cycle.*
  - The network already modelled it unit by unit: two gas turbines and a steam turbine, each with its own 18 kV terminal bus and step-up transformer.
  - It sits on the Central Coast next to one of the largest batteries in the world, so the plant's switchyard shows gas, storage and transmission meeting.
  - It opens out of Moss Landing's node on the System, or from the region, as the brief's tree says (System → Plant → Machine).
- *Energy as one currency.* On the Plant level, chevrons carry megawatts whatever the form:
  - fuel, exhaust heat, steam, shaft work and electricity;
  - heat to the sea and up the stacks.

  They share one scale. "Where does the fuel go" is then a picture before it is a table. The table closes to the watt: fuel (HHV) = delivered + GSU losses (the power flow's own) + generator losses + stack + latent heat + condenser.
- *Dispatch respects the plant's thermodynamics.* The steam turbine makes what the exhaust allows. The plant's output is split by the model (closed form), not pro rata by rating. The steam turbine has no governor and takes no slack.
- *Machine level as a sectioned drawing.* The stator is cut a quarter away and hatched, as a section drawing would be, to show the rotor. Cylinders are drawn with end circles and true silhouettes computed for the fixed camera. The phasor diagram and capability chart live in the inspector, next to their numbers.
- *Excitation is a real re-solve.* "Raise excitation" moves the unit's voltage set-point by 0.01 pu. The worker re-solves the power flow, and the operating point moves on the capability chart. The chart also draws the power flow's own rectangular reactive limits (dotted), so the simplification is visible.
- *Frequency is a separate time-domain model.* Tripping the plant runs the system frequency response from the pre-trip interval:
  - one centre-of-inertia swing;
  - each online unit's governor block;
  - load damping;
  - fixed-step fourth-order Runge–Kutta, with the step stated in the UI.

  The power flow re-solves with governor participation, for the flows after the governors have acted. The two agree on how governors share the loss (tested to 2 %).
- *SMIB equal-area as a tested library first.* The single-machine equal-area criterion and critical clearing time are checked against an offline scipy fixture. Drawing it (the P–δ curve with its two areas) is left to the fault phase, where a fault and its clearing time give it meaning.

**Rejected.**
- *A per-machine multi-machine transient simulation for the frequency dip.* It would be more faithful, but the brief asks for aggregate frequency response with a stated integrator. The single-frequency simplification is in the honesty notes.
- *Pro-rata split of a combined cycle.* The steam turbine would run independently of the heat that drives it.
- *Drawing the capability chart in 3D on the sheet.* Text in 3D is ruled out, and a chart needs its labels.
