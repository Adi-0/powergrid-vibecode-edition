# Screenshot critique — phase 5, substation → feeder → service

New views: `substation`, `substation-unfold` (held at 0.6 of the unfold), `feeder`,
`feeder-home`, `service-outlet` (the outlet selected: the trace).

## Found and fixed

| # | What the screenshot showed | Cause | Fix |
|---|---|---|---|
| 1 | The yard drawn square-on: boxes showed a front and a top only, a plan more than a drawing. | Equipment used the north-up map plan. | Equipment levels keep the plan square to the frame, seen at 45°; north arrow and scale caption per level. |
| 2 | Boxes still square-on after that change. | The drawing kit built box corners with the map plan regardless. | The kit carries its level's plan. |
| 3 | 60 kV chevrons cut straight across the yard to the bus. | One flow segment per circuit, far end to bus. | Chevrons follow the conductor: over the gantry, through switch and breaker. |
| 4 | Yard drawn small. | The fit included the incoming lines' far ends. | Fit to the yard; lines run off the sheet. |
| 5 | Key: "12 kV transmission", "0 kV secondary", and system symbols on the feeder. | Role and label mapping written for transmission. | Roles per class, 120/240 V named by label, key rows per level. |
| 6 | Mid-unfold, the yard almost open but a few pixels across. | 1000× zoom interpolated evenly in log space. | The camera leads the unfold. |
| 7 | Digits without provenance: "60 kV side", "Feeder 1105" in the breadcrumb, "ANSI C84.1", "leg 1", "12 AWG". | Plain strings. | Quantities, tagged names and glossary terms carry sources; the harness checks every view. |
| 8 | The voltage-profile caption credited the regulator on a path that does not pass it. | Generic prose. | The caption says what is on this path. |

## Still wrong or weak

- The feeder at full extent is 3.4 km across; homes are two or three pixels at that
  zoom. Zooming in works, but the level does not yet offer a closer default view.
- Only Evergreen has a substation level, one feeder a feeder level; other substations
  say nothing about it yet.
- Labels in the service cutaway crowd each other.
- Transitions between the lower levels have no screenshot at every boundary yet
  (Substation → Feeder, Feeder → Service).
