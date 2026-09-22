# 0009 — Network design and the security criterion

**Chosen.** The synthetic network was iterated against its own power flows until:
every interval converges, no branch exceeds its normal rating, voltages stay in
0.95–1.07 pu, and at the evening peak ≥ 95 % of single-branch outages keep every
branch within its **emergency rating** (1.2 × normal for lines, 1.25 × for
transformers — typical utility practice, an estimate). That is how N-1 security is
actually judged: post-contingency flows may exceed normal ratings for the hours
operators need to redispatch.

Reinforcements made along the way mirror the real grid's: three COI paths (with
COTP), three West-of-River circuits, 500 kV at Westlands and Antelope for the solar
there, bundled 230 kV where hydro and geothermal export, more transformer banks at
Tesla, Midway, Serrano, Miguel.

Deliberately tight (documented in `src/data/ca/network.ts`): San Diego's import
(Southwest Powerlink loss at peak → no operating point, echoing the initiating event
of the September 2011 Pacific Southwest outage; Path 44 partner outage → over
emergency rating), Santa Barbara's radial pair, and Path 26 for two outages.

**Rejected.** N-1-constrained dispatch (SCOPF): it would make every single outage
secure by construction and leave nothing to discover.
