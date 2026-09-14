# 0008 — How flow is drawn, and how reactive switching is controlled

**Status:** accepted · **Phase:** 2–3

## How flow is drawn

Marks **in the colour of the paper** travel along the CORE of each conductor,
leaving a hairline of ink on either side. Speed is proportional to loading;
direction is the direction real power is actually going, and reverses when the
solution says it does.

Two alternatives were tried and rejected:

- **Ink-coloured marks on the conductor.** Invisible: ink on ink.
- **Making the whole line dashed and animating the dashes.** Collides with the
  dash patterns that distinguish the distribution voltage classes, and a reader
  cannot tell an encoding from an animation.

Flow is never shown by colour (reserved) and never by line thickness (already
carrying voltage class). One channel cannot carry two meanings.

## How reactive switching is controlled

Capacitor banks and shunt reactors are switched, because the reactive problem
reverses between night and day. Getting the control signal right took three
attempts, and the failures are the interesting part.

1. **System-wide demand threshold.** Gets the import corridor exactly backwards:
   a corridor carrying 4,800 MW at four in the morning is heavily loaded even
   though the system as a whole is not.
2. **Local bus voltage.** Correct at a bus with no generator — and useless at a
   bus with one. A generator *holds* its terminal voltage; that is what a
   generator does. So the voltage never sagged, the banks never closed, and
   eleven buses were quietly running their machines to their reactive limits.
   A machine at its reactive limit has lost the ability to hold its voltage,
   and several reaching that point together is what a voltage collapse is made
   of.
3. **Chosen: both signals, by bus type.** Voltage where there is no generator;
   the machine's **reactive utilisation** where there is. That is what real
   reactive coordination does, and for exactly this reason.

Three further mechanisms were needed and each corresponds to something real:

- **A deadband**, because a device sitting on its own threshold hunts.
- **An operations counter**, because a bank whose size is large compared with
  the deadband will close, over-correct, open, under-correct and close again
  forever. Real capacitor controls have exactly this.
- **A violation-driven correction layer** over the top of the local controls:
  look at where the voltage actually ended up and move the nearest bank at each
  offending bus, one step per round. It reaches one bus away as well as the bus
  itself, because a 500 kV bus usually has nothing on it but a reactor and what
  actually holds it up is the capacitance on the 230 kV side of its own
  transformers.

A blunter "emergency: close everything" pass was tried first. It converged and
over-corrected the Bay Area to 1.08 per-unit, because it had no way to trim
back. Close what you need, then trim — both halves, or the cure is worse than
the complaint.

## Consequence

All 24 hours of a summer, winter and spring day converge with generator
reactive limits enforced, with no branch overloads and no voltage violations.
`test/california.test.ts` asserts it for all three.
