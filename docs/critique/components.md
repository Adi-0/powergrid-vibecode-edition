# Critique — components opened up (decision 0025)

Screenshots: `xfmr`, `xfmr-unfold`, `xfmr-math`, `xfmr-part`, `bank`, `bank-math`,
`cb-unfold`, `cb`, `cb-opening`, `cb-math`, `cb60`, `poletop`, `poletop-math`,
`span-unfold`, `span`, `span-math`, `cap-unfold`, `cap`, `cap-math`, `can-unfold`, `can`,
`can-math`, `reg-unfold`, `reg`, `reg-math`. Checked against the visual
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
| 11 | The span's sag, the whole point of the level, could barely be seen: at Tesla the span toward Table Mountain runs almost straight up the sheet, so the sag is seen edge-on. | The isometric view is fixed; a corridor's bearing decides how the span faces the viewer. | The drawing keeps its place in the yard; the inspector adds a side elevation (heights exaggerated by a stated factor) with the limit's ghost and the clearance, and two small curves: temperature against current with the ampacity marked, sag against temperature with the limit. Each has a dot for now. |
| 12 | Zooming toward one span handed the sheet to the span beside it. | The longer span next to it was whole at a lower zoom, and the hand-off took the nearest *whole* child. | The hand-off waits while the child nearest the focus is still unfolding. |
| 13 | The span at Tesla is short (about a hundred and sixty metres). | The span is capped at 0.85 of the distance from the first tower to where the yard's drawing hands the corridor to the map's stroke, and at Tesla that point is near. | Kept: the length is stated, and the math and sag use it. Longer spans elsewhere show the usual few-hundred-metre sag. |
| 14 | Every 500 kV yard showed a "Capacitor bank" where the model has shunt reactors. | One drawing for every switched shunt, whatever its sign. | Reactors drawn as single-phase oil-filled units, labelled as reactors; capacitors as racks of cans. Both show their steps in and out. |
| 15 | The can's + marks read as ×. | The marks lay flat on the plates, and a + seen from 45° above is a ×. | The marks stand upright, square to the view, on the plates' facing sides between the field arrows. |
| 16 | The field arrows were faint, the gap between the plates too narrow to show them. | A gap of 0.14 m at a fit of a few hundred px per metre. | Gap 0.2 m (the film is still stated as far thinner than drawn), arrows 2 px wide. |
| 17 | Zooming toward the can, the unfold view had it far above the centre. | The camera placed the can's anchor by its ground footprint, but the can stands five metres up. | The camera places a raised point by the ground point that projects to the same place on screen. |
| 18 | While the bank unfolded, a nearby span's labels ("Clearance to the ground") appeared on the sheet with no span in sight. | A band's part names showed once it was nearly whole, whether or not the reader was zooming toward it. | Only the focus band's names show. |
| 19 | The guided route's stop after the capacitor ended in a span at Tesla, not at the wall outlet. | Climbing out of the bank, the camera rested where the span toward Los Banos was whole and near the centre; the sheet went into it, and the route's climb stopped there. | After a climb nothing takes the sheet until the reader zooms; a hand-off needs the child near the focus. |
| 20 | The regulator's tap changer was a small cluster of marks, its three labels piled on each other. | A panel 0.6 m wide at a fit taking in two units and their jumpers. | The panel, selector and preventive autotransformer enlarged within the tank; the fit taken on the cut unit alone. |
| 21 | The voltage profile was a flat line squeezed against the top of its chart. | The scale always ran over ANSI Range A (114–126 V), while the primary sits within a volt or two of the set point. | The scale fits the voltages and the control's band; Range A is drawn only where it falls inside. |
| 22 | The regulator's title failed the provenance probe. | "REG-1" is a figure from the data, shown as plain text. | The name carries its data key. |

## Still wrong or weak

- **The transformer at its fitted zoom is small in a busy frame.** With the key and the inspector open, the free area is some 740 × 700 px. The tank and its bushings take about half of it, and the yard's leads cross in front at half ink.
- **Currents are only told, not shown.** The section could carry the standard ⊙/⊗ marks for each winding's current: the two sides' currents opposed, alternating with the flux. The inspector says it in words for now.
- **The breaker's contacts are schematic.** Their proportions and stroke are exaggerated so the gap reads at the fitted zoom; the honesty panel says so.
- **The other two poles do not move.** The chart shows all three phases clearing, but only the pole cut open is drawn opening.
- **The GPU cost of the new levels was not measured.** The software rasteriser here runs at under one frame a second for any view at 1440 × 900.
- **The span's sag is small on the sheet.** A few metres against a span of hundreds is true to scale; the inspector's elevation exaggerates it, the drawing does not.
- **Only the first span of a corridor is modelled.** The rest of the line's spans would share the same temperature (same current, same weather at this level of model) but not the same terrain.
- **The bank is dense.** Five tiers of four cans, three stacks per step, several steps, seen along a diagonal: the stacks overlap on the sheet. The steps were spaced wider; a real bank is as crowded.
- **The discharge is not animated.** Switching a step out sends its cans to nothing at once; a real can keeps its charge and drains through the resistor over minutes. The time constant is in the inspector.
- **At many hours the regulator sits at neutral.** The feeder's voltage stays inside the band without it; the taps are only seen working when the reader raises the set point or scrubs to a heavier hour.
