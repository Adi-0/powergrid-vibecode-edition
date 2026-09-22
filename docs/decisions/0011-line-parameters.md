# 0011 — Line parameters are computed, not typed

**Chosen.** Every line's impedance and charging comes from its construction (tower
geometry, conductor, bundle, shield wires) through Kersting's modified Carson
equations and Kron reduction — the same code validated against the IEEE 13-node
configurations (Z and B, every element, to the published 4 decimals). Positive and
zero sequence come from the transposed-line averages. Whole-line parameters use the
exact (hyperbolic) π, so long 500 kV lines are right. Thermal rating = √3·V·I_ampacity;
SIL and St. Clair loadability are computed for display.

**Why.** Traceable to conductor tables and geometry, and dimensionally consistent by
construction. A learner can follow a line's reactance back to where its wires hang.
