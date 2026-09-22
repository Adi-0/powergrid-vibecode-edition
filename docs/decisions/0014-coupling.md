# 0014 — Coupling transmission and distribution at Evergreen 60 kV

**Chosen.** The Evergreen 60 kV bus carries the whole 60 kV area's load in the
transmission model. The Evergreen distribution substation (bank, 12 kV bus with three
other feeders lumped, and feeder 1105 modelled phase by phase down to meters) is
solved with the bus's positive-sequence voltage as its source. Its three-phase demand
plus losses replaces the substation's nominal share of the bus load, and the two
models iterate (3–4 passes) until demand changes by less than 1 VA. Energy then
closes across the boundary to ~1e-5 W.

**Why this anchor.** Each pass substitutes into the *dispatched* bus load, not the
previous pass's (which would accumulate losses — an early bug). The unbalance of the
feeder shows up in the transmission model only as its total three-phase power; the
negative-sequence currents it causes upstream are a documented simplification.
