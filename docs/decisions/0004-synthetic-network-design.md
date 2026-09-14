# 0004 — Designing the synthetic California network

**Status:** accepted · **Phase:** 1

## Chosen

A 68-bus network: 24 buses at 500 kV, 41 at 230 kV, 2 at 115 kV, one at
12.47 kV. Real place names at real coordinates; synthetic circuits between them.

**Nothing is typed in as an impedance.** A line's per-unit impedance is computed
from a published ACSR conductor table, a stated tower geometry and a route
length; a transformer's from its percentage impedance and X/R on its own
nameplate. This is what makes the math panel's claim — that any number can be
reproduced by hand — true at the bottom as well as the top.

## The design was driven by the model, not by guesswork

The first version of the network did not have an AC solution at all. Rather than
tuning the solver until something appeared, the DC power flow was used as a
feasibility check, because it always has a solution and its overloads are
unambiguous. Everything below was found that way and fixed structurally:

- **The northern import corridor was too weak.** 4,800 MW arriving from Oregon
  had to pass through a single Table Mountain–Vaca circuit. Branch angle
  differences exceeded 90°, which is not a convergence problem — it means no
  solution exists. Fixed with a third Malin–Round Mountain circuit and a second
  Table Mountain–Vaca.
- **Load was being carried laterally along 230 kV instead of dropping locally
  from 500 kV.** Sylmar–Rinaldi carried 1,800 MW on 723 MVA circuits. Fixed by
  adding 500 kV buses and transformer banks at Rinaldi and San Onofre, which is
  what those sites are in reality.
- **Kern County had 4 GW of solar on a bus with no 500 kV outlet.** Fixed with a
  Kern 500 kV bus and a Kern–Midway 500 kV pair.
- **Line ratings ignored length.** A 500 kV line's thermal rating of 4,400 MVA
  is real but irrelevant: voltage drop and steady-state stability bind long
  before the metal does. Ratings now take the lower of thermal and the St. Clair
  loadability limit, `P/SIL ≈ 43/L^0.6` with L in miles.

## The reactive design was the hard part

Three separate problems, each physically real and each now modelled explicitly:

1. **6,400 MVAr of 500 kV line charging with nothing to absorb it.** A long EHV
   line is an enormous capacitor whether anyone wants it or not. Shunt reactors
   are sized at 70 % of the charging landing at each 500 kV bus.
2. **Reactive power was being shipped hundreds of kilometres.** Generators were
   producing 27,000 MVAr, most of it consumed as I²X on the way. Capacitor banks
   at 85 % of each load bus's own reactive demand cut that to 6,000–10,000 MVAr
   and dropped losses from 4 % to under 3 %.
3. **Capacitors at generator buses could never switch on.** They were controlled
   on bus voltage — but a generator *holds* its bus voltage, so the voltage never
   sagged and the banks never closed while the machine quietly ran itself to its
   reactive limit. Eleven buses were being asked for reactive power they did not
   have. The scheme now watches **bus voltage where there is no generator, and
   the machine's reactive utilisation where there is** — which is what real
   reactive coordination does, and for exactly this reason.

## Rejected

- **Tuning the solver until it converged.** The failures were the network
  telling the truth. Every one of them turned out to be a genuine design defect.
- **System-wide load thresholds for reactive switching.** Gets the import
  corridor exactly backwards: it is heavily loaded at four in the morning when
  the system as a whole is not.
- **Modelling the Pacific DC Intertie as a DC line.** It is a scheduled
  injection at Sylmar instead. Recorded in `docs/simplifications.md`.

## Result

All 24 hours of both a summer and a winter day converge with generator reactive
limits enforced, with **zero branch overloads, zero voltage violations**,
transmission losses of 2.4–3.6 % of generation, and a solve time of about 10 ms.
