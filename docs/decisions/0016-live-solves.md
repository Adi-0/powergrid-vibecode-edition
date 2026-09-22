# 0016 — Every interval is solved when asked; outcomes are solved, partly dark, or none

**Chosen.** The solver thread holds the day's dispatch and answers `solve` requests
(an interval and a set of tripped branches) with a fresh AC power flow, warm-started
from that interval's base-case solution. The sheet shows an interval only when its
answer arrives; the day strip's cursor moves at once and a grey mark shows which
interval is on the sheet. Requests coalesce (only the latest matters) and are answered
between the day's own intervals, so scrubbing works while the day is still solving.
Playback advances only after the shown interval has been solved.

A snapshot says which of three outcomes it is:
- **solved** — every energised island converged;
- **partial** — the island carrying the most demand converged, but some buses are dark
  (cut off from every source, or in an island with no operating point); their demand is
  reported as unserved;
- **none** — the main island has no operating point.

The map, title block, inspector and a notice each say which. With no operating point
the network is drawn grey and still — nothing is drawn as a solved flow — and the
notice gives the solver's reason in words, including that failing to find an
operating point is strong evidence, not proof, that none exists.

**Rejected.**
- *Precompute the day and look intervals up.* Faster to scrub, but the brief asks for
  live re-solves, and a trip changes every interval anyway.
- *Report the solver's own status* (the worst island's). A trip that darkens one radial
  substation would then read as "no operating point" for the whole state.

**Tripping is the moment after.** The dispatch stays as planned with the branch in
service; governors (droop participation) cover the change. Operators would re-dispatch
within minutes — the limits notice says so. This is recorded in
`docs/simplifications.md`.
