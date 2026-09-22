# Screenshot critique — phase 3, system view

Views captured by `npm run shots`: `system`, `system-line` (Midway–Vincent 500 kV #1
selected), `system-site` (Moss Landing selected), `system-bay` (Tesla at 5 px per km),
`system-mobile` (390 × 844 at 2×). Each view's probe checks that every visible digit
sits inside an element with provenance; `system` also measures frame cost.

## Found and fixed

| # | What the screenshot showed | Cause | Fix |
|---|---|---|---|
| 1 | At Bay zoom, 500 kV conductors vanished over part of their length; their chevrons kept going. | Sliver triangles (ear-clipped coastline; long line quads) rasterise with imprecise depth planes, beating polygon offset. | Stencilled region surfaces and per-fragment line depth — decision 0015. |
| 2 | Malin and the whole California–Oregon Intertie missing at state zoom; only the label "MALIN" floated over an empty border. | Neighbouring states sat 16.5 km below California's surface, so a site just over the border was behind the slab's edge. | Neighbours on the same ground; land borders as chain lines; the slab's cut section only at the coast. |
| 3 | Phone: the key filled the screen and overlapped the title block; the progress box covered the breadcrumbs. | Desktop placement carried over. | Key folds to its heading on narrow screens (one tap to complete); title block drops its two static rows; progress sits above the title block; the fit uses the title block's measured height. |
| 4 | "500 KV", "Π MODEL" in the inspector. | Uppercase headings transform units and Greek. | Inspector headings and the kind line are sentence case. |
| 5 | "Losses = P_f + P_t", "S = V·I*" as plain text. | No formula typesetting in rich text. | `$…$` in rich text sets ISO 80000-2 notation: italic symbols, upright descriptive subscripts and j. |
| 6 | The selected circuit was hard to find (2.5 px heavier among hundreds of strokes). | Weight alone is a weak cue at state scale. | Focus and context: the rest of the network recedes to ~22 % ink; unrelated place names to ink 35 %; the selection's ends keep their names. |
| 7 | "≈ 111 729 homes"; "largest mismatch 0.000 W". | False precision; a residual that spans decades shown in fixed units. | Homes to three figures (the average it divides by is shown to three, so the division can be redone by hand); residual with an SI prefix to two figures ("24 µW"). |
| 8 | Digits outside the display layer: "(Tesla 500 kV)", "battery storage (4 h)". | Hard-coded strings. | Routed through `dataText`/`qty`; the harness now fails on any such digit. |
| 9 | (Latent, found reading code while fixing #6.) 115/60 kV strokes and their chevrons reappeared at state zoom whenever a new interval arrived. | Applying a snapshot reset every stroke's alpha to 1. | Zoom visibility is folded into snapshot styling; crossing the zoom threshold re-applies it. |

## Performance

Measured by the `system` probe while the camera pans continuously for 4 s (so labels
are laid out every frame), full network on screen, 1440 × 900:

- main-thread cost per frame: 1.7 ms average, 3.8 ms p95, 4.4 ms max (budget 16.7 ms);
- GPU workload: 8 draw calls, 9 523 triangles, 3 967 instanced segments and chevrons.

Not measured: frame rate on a GPU. Headless Chromium here rasterises in software
(SwiftShader), reaching 5 fps with the sheet and 28 fps with nothing drawn at all, which
says nothing about a GPU. The claim that stands is the main-thread budget and the size
of the GPU workload, which is small for any integrated GPU.

## Still wrong or weak (carried forward)

- The Bay Area and the Los Angeles basin are dense at state zoom: corridors overlap and
  lower-priority names are dropped. The region view (phase 4) is where they get room.
- A plant's technology label can wrap mid-phrase in the inspector ("battery storage /
  (4 h)").
- With the inspector open on a 1440 px screen it covers the eastern desert (Devers,
  Palo Verde); the camera does not yet move to keep the selection clear of panels.
- Chevrons on parallel circuits start at fixed phase offsets; at some zooms two
  circuits' trains line up and read as one heavier train.
