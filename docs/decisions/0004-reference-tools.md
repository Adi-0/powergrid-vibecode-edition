# 0004 — Reference tools for fixtures

**Chosen.** pandapower 3.5.5 (Python 3.11) for IEEE 14- and 30-bus AC power flow
reference solutions (its case files are the MATPOWER cases), OpenDSS via
OpenDSSDirect.py 0.9.4 as an independent unbalanced solver to cross-check our
IEEE 13-node implementation, alongside the published IEEE 13-node results.
Scripts live in `tools/ref/`; outputs are committed JSON fixtures under
`test/fixtures/` stamped with tool name and version.

**Why.** The brief asks for known answers computed by established open-source tools,
committed, with tool and version recorded. Tolerances follow the precision each
reference supports (see each fixture's header).
