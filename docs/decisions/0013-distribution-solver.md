# 0013 — Distribution: Kersting's ladder, element by element

**Chosen.** Backward/forward sweep with each element's generalised matrices:
line segments (full 3×3 phase impedance and shunt admittance, from Carson + Kron),
three-phase banks (Yg–Yg, and Δ–Yg step-down with the ANSI 30° lag), step-voltage
regulators, switches, and the single-phase center-tapped service transformer
(Z₀ = 0.5R + j0.8X on the primary, Z₁ = Z₂ = R + j0.4X per half winding on the
120 V base — which makes the full-winding impedance equal the nameplate). Loads by
connection (wye, delta, 120 V leg, 240 V) and voltage model (constant P, Z, I).
Kron reduction assumes a perfectly grounded neutral, so neutral-to-earth voltage is
zero (see the honesty panel).

Two conventions chosen to match the published IEEE 13-node solution, which the model
now reproduces to 2e-4 pu and 0.013°:
- Regulator ratio = 1 + 0.00625·tap (0.625 % per step), as in the published results
  and OpenDSS; line-drop compensation finds the published taps (10, 8, 11) itself.
- The uniformly distributed load on 632–671 uses Kersting's "exact lumped load" model
  (2/3 at a quarter of the length, 1/3 at the end), which preserves both voltage drop
  and losses. OpenDSS's 1/3-point node is kept as an option and matches OpenDSS.

**Rejected.** A three-phase Newton–Raphson for the feeder: works for meshed networks
but is harder to follow; a radial feeder is what the sweep was invented for, and each
of its steps is a sentence a learner can read.
