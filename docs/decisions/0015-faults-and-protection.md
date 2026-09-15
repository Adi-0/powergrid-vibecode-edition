# 0015 — Faults, the three networks, and what "selective" actually means

**Status:** adopted, phase 7

## Three networks, not one

Everything else in this app rests on the balanced positive-sequence assumption,
and a fault breaks it: one conductor touches earth, or two touch each other, and
the three phases stop being copies of one another rotated by 120°.

So this phase is where the single-phase equivalent is abandoned and symmetrical
components take over. Fortescue's result — that any three phasors are the sum of
a positive-sequence set, a negative-sequence set and a zero-sequence set — turns
one unbalanced problem into three balanced ones. That is not a mathematical
convenience. Each of the three behaves differently in real equipment, and each
has its own network:

- **Positive and negative sequence** see much the same passive network. Lines and
  transformers do not care which way the phase sequence turns.
- **Zero sequence sees a different network entirely.** Its current is identical
  in all three phases, so it cannot flow without a return path through earth. A
  line's zero-sequence impedance is about three times its positive-sequence
  value, because the return loop encloses far more area. And a transformer
  either passes zero-sequence current or blocks it completely depending on how
  its windings are connected.

That last point is the most consequential thing in the file. A delta winding is a
closed loop with no connection to earth: zero-sequence current can circulate
inside it but cannot get in or out. **That is the whole reason a distribution
transformer is delta on the high side** — a ground fault on a feeder cannot push
earth current back onto the transmission system — and it is why `Dyn1` is not
decoration on a nameplate.

## The zero-sequence network is disconnected, and that is the point

The first implementation solved `Y·z = e_k` on the whole matrix and failed on a
singular pivot. The instinct is to add a small shunt everywhere to make the
matrix invertible. That would have been a lie.

Every delta winding is an open circuit to zero sequence, so the zero-sequence
network genuinely falls into islands, and a bus in an island with no path to
earth genuinely cannot carry zero-sequence current. Its Thevenin impedance is
infinite — which is the correct answer, and describes a real and deliberate
engineering choice: an ungrounded system, in which a single line to earth drives
almost no current at all and the plant keeps running with one phase at earth
potential.

So the solve is restricted to the island the faulted bus is actually in, using
connectivity *in the sequence network* rather than in the physical one, and an
island with no reference to earth returns infinity rather than a number.

## Selectivity is geometry before it is timing

The first working version had a fuse on Cherry Lane "clearing" a fault on the
substation busbar in seven milliseconds. It was picking the fastest device in the
chain without asking whether the fault current passed through it at all.

It does not. A fuse on Cherry Lane carries the current to Cherry Lane and nothing
else. Working out which devices are actually in series with a fault is therefore
the *first* step, before any curve is evaluated, and the chain is now computed
from the feeder's own topology. With that fixed the app says the thing it exists
to say:

| Fault | Cleared by | Time | Who notices |
|---|---|---|---|
| On a lateral | the lateral fuse | 0.015 s | one street |
| On the feeder main | Recloser R1 | 0.60 s | one feeder, briefly |
| On the 12.47 kV busbar | bank differential 87B | 0.05 s | the station's low-voltage bus |

## Coordination is checked over the currents that can happen

Two curves can sit comfortably apart at one current and cross at another, and the
crossing point is exactly where a fault will eventually happen. So coordination
is checked across the whole range of fault currents the feeder can produce — 83
checks — rather than at one convenient number.

But the range has to be the *right* range, and getting that wrong produced a
failure that was not one. The feeder breaker's instantaneous element quite
properly beats the recloser above 7.4 kA. That is what an instantaneous element
is for: it is set just above the fault current available **at the recloser**, so
it can only ever respond to a fault between the breaker and the recloser — the
one stretch of feeder no other device protects. A fault further out draws less
current because of the line impedance in between and cannot reach the threshold.

One number, and it distinguishes near from far without measuring distance at
all. Above that current no downstream fault exists to coordinate with, so each
device now carries the largest fault its own zone can produce and the check stops
there. Asking beyond it is a question with no physical meaning.

## An overcurrent relay is backup, not primary

A fault on the 12.47 kV busbar draws 23 kA and the backup overcurrent relay would
take 2.2 seconds. Quoting that as the clearing time would be off by a factor of
forty. The primary protection for a busbar is **differential** — compare
everything entering the zone with everything leaving it, and a difference can
only mean a fault inside, so there is nothing to wait for and no coordination
delay at all. It clears in about three cycles.

The study now names the differential where the faulted point is inside a
differential zone, and says plainly that the overcurrent relay's two seconds is
what happens only if the differential fails.

## What is calculated and what is not

The fault calculation is a **snapshot of the first cycles**: a linear circuit
problem solved by superposition about the pre-fault operating point. It does not
simulate what happens next — the protection operating, the arc extinguishing at a
current zero, the voltage recovering, the machines swinging against one another.
Those need a time axis this model does not have.

Two consequences are in the honesty register. The fault current does not decay as
the machines move from X″ to X′ to X_d, and there is no direct-current offset in
the first cycle. And the drawing deliberately does not redraw the network as
permanently short-circuited: it shows the cycle before, with a cross where the
fault is, because that is the condition the calculation is actually about.
