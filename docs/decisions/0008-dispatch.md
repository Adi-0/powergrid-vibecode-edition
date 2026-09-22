# 0008 — Dispatch: commitment, storage, and security-constrained economic dispatch

**Chosen.** Per 15-minute interval (96 per day), in this order:
1. Must-take: nuclear at full output, geothermal at 95 %, wind and sun as available.
2. Energy-limited: each hydro plant spends its day's water where demand is highest
   (water-filling); the battery fleet and pumped storage charge in the valley and
   discharge on the peak with round-trip losses, state of charge kept feasible over a
   cyclic day.
3. Priority-list unit commitment with start-up lead times, minimum up times, a 6 %
   operating reserve, and reliability must-run units.
4. Economic dispatch in merit order within ramp limits, then **security-constrained**
   redispatch: a DC network model (PTDFs) and a linear program (own two-phase simplex,
   `src/physics/lp.ts`) keep every branch within 92 % of its rating in MW (headroom
   for MVAr). Its duals give locational marginal prices.
5. Interties sell in blocks at rising prices (their neighbours' supply curves).
6. The day runs twice so midnight's ramp and commitment are consistent, and dispatch
   is repeated with the losses the first power-flow pass found.

**Rejected.** Pure merit order without the network: imports from Arizona ended up
serving the Bay Area across a 120° angle spread, with the Bay Area's own plants idle —
nothing like a real operating point. A full MILP unit commitment: far more machinery
than the teaching goal needs; the priority list is the textbook method.

**Why.** Merit order, the marginal unit, congestion and LMPs are all things the brief
wants visible; they come out of this directly and each step is explainable.
