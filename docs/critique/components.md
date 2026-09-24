# Critique — components opened up (decision 0025)

Screenshots: `xfmr`, `xfmr-unfold`, `xfmr-math`, `xfmr-part`, `bank`, `bank-math`,
`cb-unfold`, `cb`, `cb-opening`, `cb-math`, `cb60`. Checked against the visual
direction in CLAUDE.md, and against the author's ask: see how a thing works, visually,
without a wall of words.

| # | What the screenshot showed | Cause | Fix |
|---|---|---|---|
| 1 | The section's windings read as grey hatching at the fitted zoom. | Turns drawn as filled blocks 5 px tall with 1 px gaps. | Kept: this is what a winding in section looks like, and it resolves into single turns one zoom step in. The winding's outline is drawn heavier than the blocks, so each winding reads as one object first. |
| 2 | The oil's chevrons ran round the section's bottom edge like a border of arrows. | The heat scale was 15 kW per px: a large bank's loss put every chevron at the maximum size. | 40 kW per px. The loss is split along the loop (a sixth up each duct, half to each radiator), so the chevrons' sizes add up as the heat does. |
| 3 | The flux arrows were lost in the section. | Arrows 1.4 px wide and 1.5 core half-widths long. | 2.2 px wide and 2.1 core half-widths long, with a larger head. Drawn in front of the section, in the only strokes on the sheet that move with time. |
| 4 | "Conservator" was named twice at Evergreen. | The substation's own label and the transformer level's. | A portal now names every parent label it replaces. |
| 5 | The inspector still showed the station inside a transformer. | No view for the new level. | Four short steps in the drawing's order, each with its live numbers. A part picked says what it is for. |
| 6 | The breaker's inside was a few pixels across: the fit took in all three poles, the bushings' tops and the mechanism. | Fit on the whole breaker. | Fit on the pole cut open (its tank and the feet of its bushings); the rest stands behind and above. |
| 7 | The arc and the nozzle could not be seen while the breaker opened. | They sat inside the fixed contact and the puffer, whose faces hid them. The tank's ends were drawn as rings (the cylinder's stator mode), so the eye looked through the tank. | The contacts were laid out so the gap opens in the clear: the nozzle and pin show once the contacts part. The tank's ends are capped but for the cut. |
| 8 | The power chevrons ran through the middle of the cut tank, over the contacts. | One path from bushing to bushing through the tank. | Chevrons down one bushing and up the other; inside, the contacts and the arc tell the story. |
| 9 | At Evergreen, the breaker level rendered blank: the view kept its labels and nothing else. | The state map's land surface is one rectangle as big as California. Seen from a frame a thousand times finer, clipped at that size, its depth landed in front of the drawing and covered it in the ground colour. This could happen deep in any level. | Once the map has receded (zoomed into a yard or closer), the land surface is not drawn at all. |
| 10 | Labels for the moving parts pointed at empty gas once the contacts had moved. | Labels do not travel with a moving group. | Each moving part is named where it passes, not where it starts. |

## Still wrong or weak

- **The transformer at its fitted zoom is small in a busy frame.** With the key and the inspector open, the free area is some 740 × 700 px. The tank and its bushings take about half of it, and the yard's leads cross in front at half ink.
- **Currents are only told, not shown.** The section could carry the standard ⊙/⊗ marks for each winding's current: the two sides' currents opposed, alternating with the flux. The inspector says it in words for now.
- **The breaker's contacts are schematic.** Their proportions and stroke are exaggerated so the gap reads at the fitted zoom; the honesty panel says so.
- **The other two poles do not move.** The chart shows all three phases clearing, but only the pole cut open is drawn opening.
- **The GPU cost of the new levels was not measured.** The software rasteriser here runs at under one frame a second for any view at 1440 × 900.
