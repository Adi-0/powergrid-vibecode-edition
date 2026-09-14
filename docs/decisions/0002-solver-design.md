# 0002 — Power-flow solver design

**Status:** accepted · **Phase:** 1

## Chosen

Newton–Raphson in **polar form**, with a dense LU factorisation, plus three
robustness measures that turned out to be necessary rather than optional on a
network spanning a thousand kilometres:

1. **DC power-flow initialisation.** The angle spread across the California
   network from Malin to San Diego is over 130°. A flat start asks Newton to
   cross that in one leap, and it does not survive the attempt: the iteration
   left the physical region entirely and produced negative voltage magnitudes.
   Solving the linear approximation first costs one extra factorisation and puts
   the iteration inside the basin of attraction.
2. **Backtracking line search.** Take the Newton step, measure whether the
   largest mismatch actually got smaller, and halve the step until it does. A
   fixed step cap alone produced a *limit cycle*: the iteration oscillated
   between two bad points forever. Near the solution neither the cap nor the
   search binds, so quadratic convergence is untouched.
3. **Reactive-limit switching with restoration.** A PV bus whose machines run
   out of reactive capability becomes a PQ bus pinned at the limit. Crucially it
   must be able to switch *back*: later switching elsewhere can raise its
   voltage above the setpoint it was trying to hold, at which point it should be
   a PV bus again. A one-way procedure ratchets and strands the system in a
   state it would never reach. A per-bus operation counter stops a bus that sits
   exactly on its limit from oscillating forever.

## Rejected

- **Rectangular-form Newton–Raphson.** Slightly better conditioned. Rejected
  because polar form is what every textbook the reader will pick up next uses,
  and the math panel has to show the same equations they will see there.
- **Fast-decoupled load flow.** Faster per iteration. Rejected because the
  decoupling assumption (P–θ and Q–V are independent) is *false* on the
  distribution feeder, where X/R is near 1 — and the feeder is the part of the
  model the brief says matters most.
- **A sparse solver.** Correct for a real system. Rejected at this size: dense
  LU on 400×400 runs in well under a millisecond, and forty readable lines beat
  a sparse factorisation nobody will read.

## Also built

**Gauss–Seidel** (`src/core/gauss-seidel.ts`) and **DC power flow**
(`src/core/dc-powerflow.ts`) are not dead code. Gauss–Seidel shares no code path
with Newton–Raphson — no Jacobian, no factorisation, a different update rule —
so agreement between them is real evidence independent of any published table,
and it is the algorithm a person can actually run by hand. DC power flow is the
honest first answer to "why does power flow that way?", and it is the
feasibility check that found the network's structural problems (see 0004).
