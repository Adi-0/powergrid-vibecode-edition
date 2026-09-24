# Screenshot critique — one continuous zoom (decision 0023)

New views:
- `site`, `site-math`: the Tesla yard;
- held part-way through each unfold: `site-unfold` (Tesla at 55 %), `feeder-unfold` (Evergreen's neighbourhood at 60 %), `substation-unfold`, `plant-unfold`, `machine-unfold`.

The level views now reach their places through the zoom tree:
- `feeder` and the fault views via Evergreen's node;
- `substation` via the neighbourhood;
- `plant` and `machine` via the Moss Landing yard.

`tour-run` walks all fourteen stops.

## Found and fixed

| # | What the screenshot showed | Cause | Fix |
|---|---|---|---|
| 1 | Columns of flattened boxes standing over the neighbourhood. | The feeder's sketch still drew boxes with the old map plan, so every home was drawn twice, the copy turned 45° about the substation. | The sketch takes the level's plan. |
| 2 | The grocery building sat on top of lateral L5's homes. | The spur and L5 leave F3 on the same side, along the same line (drawing positions only). | The spur is drawn 160 m out to the east of L5, the modelled length. |
| 3 | Zooming into Unit 1 handed the sheet straight back. | The band's hand-off zoom had been pushed above the plant's own fitted zoom, so settling there crossed the hand-back line. | A child's band now ends below its fit. A level settles at a zoom where its children are still folded. |
| 4 | Three labels "to Newark" at one tower; a tower for every circuit. | Bays drawn per circuit, all the way out. | One tower per corridor, carrying its circuits on its arm; one name per corridor. |
| 5 | Chevrons in a yard twice the size of the same circuit's on the map. | A yard had its own MW scale. | Yards use the System's scale, so a circuit's chevrons keep their size across the hand-off. |
| 6 | The neighbourhood unfolding as a dense black blot at the substation. | Every stroke collapsed to one point. | The neighbourhood grows down its streets: each span from the pole before it, each home from its drop, in order of distance along the feeder. Yards grow out of their buses. |
| 7 | At the generator, the plant's machinery drawn as heavily as the cut-open machine. | Levels above were drawn at full ink. | The levels above recede: half ink, then a third. The level on the sheet recedes the same way as a child unfolds in it, so the hand-off does not jump. The System around a station stays in full ink: its circuits are the station's own. |
| 8 | "Moss Landing Unit 1" twice when inside the plant. | The parent's name for the node was kept as context. | Each portal names the label it replaces. |
| 9 | Two tour stops failed the provenance probe ("500 kV" in plain text). | Figures in prose. | Reworded without figures. |

## Still wrong or weak

- **A big station's yard is busy at its fitted zoom.** Tesla brings twelve circuits in from every side. Each runs from its gantry over its corridor's tower to where the map's stroke takes it up, and runs cross the yard where a circuit's bearing points across the bus. Real stations route these with more care: bays on the side each line comes from, and ring or breaker-and-a-half arrangements.
- **Unit 1 has a short band.** It starts only once the Moss Landing yard is on the sheet and ends before the plant's own fit, so a wheel notch or two covers it. Double-click plays it at a readable pace.
- **The 60 kV circuits from Metcalf to Evergreen look busy.** On the System sheet near Evergreen, their chevrons and dash-dot pattern together make a busy stroke.
- **Neighbouring children pop at the hand-off.** When the sheet goes to one of several children unfolding side by side (services on a lateral, the three generators), the others drop to the parent's receded drawing: their homes and boxes stay, but their own details (cans, secondaries, cut-aways) go at once.
- **The GPU frame rate while six children unfold was not measured.** The software rasteriser cannot; the main-thread cost is measured on the System sheet only.
