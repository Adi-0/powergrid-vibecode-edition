# Screenshot critique — phase 7, plant, machine and frequency

New views:
- `plant`, `plant-trip`, `plant-math`, `plant-unfold` (System → Plant, held mid-way);
- `machine`, `machine-hi` (2×), `machine-excite`, `machine-math`, `machine-unfold` (Plant → Machine).

## Found and fixed

| # | What the screenshot showed | Cause | Fix |
|---|---|---|---|
| 1 | Digits without provenance: "Generator (GT1)", "HRSG 1", "Unit 2 and the battery", "Gas turbine generator 1", an "Open Unit 1" button. | Names with numbers as plain strings. | Labels tagged with their data keys; the button renamed; prose reworded ("RK4" → fourth-order Runge–Kutta). |
| 2 | The key called the 18 kV generator bus "12 kV primary distribution". | The class lookup named the 4–35 kV class by its nominal distribution voltage. | A generator class: same weight and dash, named "18 kV, generator voltage, inside the plant". |
| 3 | The generator read as a thin rod: the stator's cut was 121° wide and its shell barely showed. | Cut window too large. | A quarter cut facing the viewer, with the cut faces hatched as a section; the leads leave the stator's intact top on the north side. |
| 4 | Chevrons inside the exhaust duct, the enclosed bus and the stacks were hidden. | Flow segments ran through boxes, and hidden-line removal hid them. | Chevrons ride on the outside of the duct and enclosure, and leave from the stack tops. |
| 5 | Capability chart: "Q, M210" (axis title on a tick), and the key text over the curves. | Labels placed in the plot area. | Ticks without the end value; a key row below the axis; the side notes (under- and over-excited) below the ticks. |
| 6 | Phasor labels V_t and I_a on top of each other. | Near-colinear at a power factor near 1. | V_t labelled above its tip, I_a below. |

## Still wrong or weak

- Plant labels crowd around the HRSGs and stacks at the default zoom. Collision avoidance keeps them apart, but the cluster is dense.
- The transition stills show the drawing growing from its node. Most parts have unfolded by the midpoint, because the camera leads the unfold.
- The SMIB equal-area construction is tested but not yet drawn; that is planned for the fault phase.
- The frequency response is one centre-of-inertia frequency. The plant is on the Central Coast, but the chart cannot show that frequency dips first and deepest near it.
