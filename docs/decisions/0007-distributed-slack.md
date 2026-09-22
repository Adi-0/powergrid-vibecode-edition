# 0007 — Distributed slack, with two participation modes

**Chosen.** Newton–Raphson with an extra unknown λ (the total imbalance) shared by
generators in proportion to participation factors; every bus has a P equation and
the reference bus is only an angle datum (Tesla 500 kV). Units that would pass a
limit are pinned there and the rest re-share. Two participation modes, because "who
picks up the slack" depends on the time scale:

- **agc** (minutes; used for every scrubber interval): dispatchable California units
  in proportion to ramp capability; interties take a small share.
- **governor** (seconds; used right after a trip): every governed unit in proportion
  to rating/droop, *including the rest of the western interconnection behind the AC
  ties* (an equivalent governor capacity per tie). DC links do not respond.

**Rejected.** Single slack bus: one bus absorbs a 2 GW loss, which is not how a grid
responds. It stays available (the IEEE fixtures use it, as MATPOWER does) and is
explained in the honesty panel as the textbook simplification.
