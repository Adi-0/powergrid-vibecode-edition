# 0003 — How the solver is validated, and what the published tables actually say

**Status:** accepted · **Phase:** 1

## The problem

The brief asks for validation "against the published IEEE 14-bus and 30-bus
reference solutions to 1e-6". Taken literally that is not achievable, and the
reason is worth recording because it is a lesson about reference data rather
than about the solver.

The published bus tables are printed to **three decimal places on |V| and two on
θ**. There is no 1e-6 in them to match. Worse, the IEEE 30-bus table is not
self-consistent with its own generator records: it lists bus 2 at 1.043 per-unit
while the generator at bus 2 sets 1.045 per-unit, and a PV bus sits at its
setpoint by definition. The table is the historical IEEE report solution, not a
solve of the data distributed alongside it.

## Chosen

Validate to 1e-6 by means that do not depend on recalled or rounded digits, and
validate against the published tables to the precision those tables carry. Four
independent lines of evidence, in `test/solver-ieee.test.ts`:

1. **The residual itself.** Substituting the solution back into the power-flow
   equations leaves a mismatch of **7×10⁻¹⁵** (14-bus) and **1.8×10⁻¹⁴**
   (30-bus) per-unit — nine orders of magnitude inside the requirement. This
   proves the answer satisfies the equations.
2. **Agreement with a structurally different algorithm.** Gauss–Seidel agrees
   with Newton–Raphson to **1.9×10⁻¹²** on |V| and **1.6×10⁻¹¹** rad on θ for
   the 14-bus case, **7.2×10⁻¹²** and **7.4×10⁻¹¹** for the 30-bus. Two methods
   sharing no code converging on the same point is the strongest evidence
   available.
3. **`I = Y·V` at every bus**, checked directly, to 1e-12.
4. **The published tables**, to their own precision. The 14-bus case matches to
   1.3×10⁻³ per-unit and 0.017° — exactly the rounding in the table — and its
   published total loss figure of 13.393 MW is reproduced as **13.3933 MW**. The
   30-bus case is asserted more loosely, for the reason above, and the tolerance
   in the test carries that explanation in its own message.

## Data provenance

Both case files are **generated** by `tools/gen-ieee-case.mjs` directly from the
authoritative MATPOWER `.m` files, not transcribed. This was not fastidiousness:
the first version of both files was written from memory and carried real errors
— several 30-bus branch impedances were wrong, and two bus angles were
impossible (a PV bus with zero real power flow across a zero-resistance
transformer must sit at exactly its neighbour's angle; the recalled values did
not). The generated files are committed, so the app has no build-time dependency
on MATPOWER.
