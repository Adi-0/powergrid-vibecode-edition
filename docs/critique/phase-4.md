# Screenshot critique — phase 4, time, trips, the region, the first transition

New views in `npm run shots`: `system-noon` (scrubbed to 12:30), `system-play`
(playback; the probe checks every shown interval was solved when asked),
`system-trip` and `system-trip-show` (Santiago–San Onofre 230 kV #1 tripped; its twin
overloads), `system-nosol` (the Southwest Powerlink tripped at 19:00: no operating
point), `region-bay`, `region-bay-xfmr` (a Metcalf 230/60 kV bank selected),
`region-bay-dark` (Evergreen cut off), `region-bay-fold` (the transition held half
way), `region-exit` (folded back to the System), `system-close` (paper tooth). Every
view's probe checks that every visible digit has provenance.

## Found and fixed

| # | What the screenshot showed | Cause | Fix |
|---|---|---|---|
| 1 | After a trip the overloaded twin circuit was invisible at state zoom, and when selected everything else — including the overload — receded. | Focus-and-context dimmed everything not selected. | What is wrong (signal) and what the reader changed (tripped) never recede; a limits notice lists overloads with a Show button that flies the camera there. |
| 2 | No ✕ on the tripped circuit and no ⚠ on the overloaded one, anywhere. | three.js fixes an instanced geometry's drawable count at first bind; the marks layer was first drawn empty. | Batches that grow are disposed before re-upload. |
| 3 | Generator circles cut in half; the tripped (offset) circuit hidden. | Pixel-offset strokes kept their anchor's depth; the ground nearer the camera beat them. | Offset fragments take the depth of their anchor's horizontal plane at their own pixel. |
| 4 | "Supply: — MW generated; losses 0.00 MW" with no solution. | Summary rows printed regardless of outcome. | With no operating point the row says there is nothing to report. |
| 5 | Phone: the day strip missing. | Its phone override came earlier in the stylesheet than the desktop rule. | Overrides moved after it; strip given 112 px. |
| 6 | The duck barely visible: the chart ran from 0 MW. | A line chart scaled like a bar chart. | Scale between round numbers bracketing the day, both ends labelled. |
| 7 | Region: a forest of verticals through the lower layers; the region drawn small. | Every generator and load ran to the ground; layers spaced wide. | Short risers and drops hanging from their own bus; lowest layer just above the ground; tighter spacing. |
| 8 | Mid-fold, the rest of the state's network vanished; the region floated on an empty map. | The System handed over its whole network. | It hands over only the region's substations and circuits; the rest stays faint as context. |
| 9 | "1 buses"; whole solution row red for a partly dark grid; key running under a taller title block. | Wording, over-use of the signal, fixed key height. | Singular/plural; only the unserved figure in signal; key height from the title block's. |

## Still wrong or weak (carried forward)

- The exploded Bay is dense: labels cross line work and each other, and the three
  layers overlap on screen. Fanning the layers or opaque plates were considered and
  rejected (decision 0017); better label placement is the likely next step.
- Only a zoom-out, Esc, the breadcrumb, double-click or the inspector's button change
  level; zooming in does not unfold a region by itself.
- A trip shows the moment after; there is no "re-dispatch" action yet to show what
  operators do next.
- Playback runs at about six intervals a second in headless software rendering; on a
  GPU the solve (tens of ms) is the limit.
