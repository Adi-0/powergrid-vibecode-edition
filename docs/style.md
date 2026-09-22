# Visual language

Source of truth in code: `src/render/style.ts`. This file explains it.

Reference: technical drawing — patent illustration, axonometric architectural section,
cutaway engineering diagram. A precision instrument, not a landing page.

## Ground, ink, signal

| Token | Value | Use |
|---|---|---|
| Ground | `#EFECE4` | Paper. Also the fill of every face (hidden-line removal). |
| Ink | `#14161A` | All line work and text. |
| Ink tints | ink mixed toward ground (60 %, 35 %, 15 %) | Context that is present but not the subject (coastline, grid, de-emphasised levels). Not a hue. |
| Signal | `#D93A1E` | **Only**: over a limit, outside a voltage range, fault, load shed, no solution. Always paired with a pattern or mark (hatch, ✕, a notch) so it reads without colour vision. |

## Voltage class: weight and dash, never hue

| Class | Weight (px) | Pattern | Role |
|---|---|---|---|
| 500 kV | 3.4 | solid | Bulk transmission |
| 230 kV | 2.1 | solid | Transmission |
| 115 kV | 1.6 | long dash 18/5 | Transmission |
| 60–70 kV | 1.3 | chain (dash-dot) 14/4/2.5/4 | Subtransmission |
| 4–35 kV | 1.1 | solid | Primary distribution |
| 120/240 V | 0.8 | short dash 7/4 | Secondary and service |

Weights are pen widths: constant on screen at every zoom, as on a drawing. The first
system screenshots used 4.6/3.0/2.1/1.6 px; at state scale the corridors merged into
black bands, so every class came down about a quarter while keeping the ratios.

One stroke per circuit. Parallel circuits in a corridor are offset sideways by
(weight + 3) px each, centred on the corridor, so a double-circuit line reads as two.
Below 1.5 px per km the 115 and 60 kV classes and the generator symbols are not
drawn, and the key drops them with them; the key always lists exactly what is drawn.

## Other pens

| Pen | px | Use |
|---|---|---|
| hairline | 0.6 | Slab bottom edge, neighbouring coasts, break lines, lakes |
| fine | 0.8 | Land borders (chain line, ink 60 %) |
| coast | 0.8 (+0.3 mainland) | California's coast, in ink |
| medium | 1.4 | Marks: warning triangle, out-of-service cross |

## The sheet

- **The state as a slab.** California is a thin slab (30 km drawn thickness); the
  sides that face the viewer are cut sections, hatched at 45° in ink 15 %, which is
  how a drawing marks material that has been cut. Its coast is drawn in ink.
- **Neighbours on the same ground.** Oregon, Nevada, Arizona and Baja California
  continue the ground plane around the slab, drawn only as far as a band around
  California. Their coasts are hairlines in ink 60 %, borders between them chain lines,
  and the edge where the sheet stops drawing them is a **break line** (a gentle zigzag,
  ink 35 %) — the drafting sign for "continues, not shown". An earlier version set
  them a step lower than California; that hid Malin, the Oregon end of the
  California–Oregon Intertie, behind the slab's edge, so they came up to ground level.
- **Land borders** are chain lines (dash-dot), the drafting convention for a boundary.
- **Lettering.** Places in semibold capitals with tracking; regions and the sea in
  widely spaced capitals, ink 60 %, no background. Place labels sit on an 82 % ground
  patch so they read over line work.
- **Border and title block.** A hairline sheet border with zone numbers and letters; a
  title block (sheet, time, demand, supply, solution, model note) in the lower left.
- **Furniture.** North arrow and a scale bar, which states the projection honestly:
  "N km east–west; north–south is drawn at 57.7 %" (the axonometric foreshortening of
  the ground plane's up-screen axis).

## Flow

Power flow is a train of chevrons along the conductor, pointing the way real power
flows. Size = |P| / 120 px per MW (5–22 px); speed = |P| / 40 px per s per MW. Both are
set from the solved power flow; nothing is scripted. The key draws the chevrons for
500 MW and 2000 MW with the renderer's own sizing function.

## Selection

Focus and context: the selected circuit or place, and whatever it connects to, stays
as drawn; the rest of the network recedes to about a fifth of its ink (the map does
not), and unrelated place names fall back to ink 35 %. A selected circuit is drawn
1.6 px heavier, and the places at its ends keep their names at every zoom.

## Signal

Only for something wrong — a branch over its rating, a bus outside its voltage band,
a bus with no source, no solution. Always paired with a mark: the warning triangle
at mid-span or beside the site, so the state reads without colour vision.

## Type

One family, Atlas Sans (IBM Plex Sans, OFL, subset and bundled), in three styles.
Figures are tabular. Quantities: value, thin space, unit in ink 60 %; a symbol is
italic, a descriptive subscript upright (P<sub>f</sub>, P<sub>loss</sub>). Formulas in text
follow ISO 80000-2 (italic quantity symbols, upright j and words). Headings on panels
are capitals; headings inside the inspector are sentence case, because they carry
units and symbols ("500 kV", "π model") that capitals would corrupt.

## Paper tooth

At close zoom only (from 8 px per km, full at 24), a faint grain multiplies the finished
frame: value noise at the sheet's scale, fixed to the screen like the border (the paper
does not move when the drawing is panned). At most 4.5 % darker; ink stays ink. It is
texture, not shading.

## Notices

When a solution is not whole and healthy, a notice sits at the top of the sheet: a
panel with a signal-coloured rule and heading — "No operating point", "Part of the grid
is dark", "Over a limit" — the reason in words, and what the reader can do (Show,
Restore everything). It is the only panel that uses the signal colour for its frame.

## The day strip

Across the bottom: the dispatched day as a line chart. Dashed ink 60 %: what customers
use; thin ink: from the grid after rooftop solar; heavy ink: what is left for the rest
of the fleet (the duck); the band between the last two — utility solar and wind —
hatched at 45°. Both ends of the scale are labelled, since it does not start at zero.
The cursor (ink) is where the reader asked; a wide grey mark is the interval on the
sheet, solved.

## Region level

See decision 0017. Layer plates: chain line, hairline, ink 35 %, lettered in spaced
semibold capitals, ink 60 %. Substation axis: hidden-line dashes, hairline, ink 35 %.
Busbar: 22 px, 3.2 px. Transformer: 1.4 px stroke between busbars, banks 8 px apart,
two 4.2 px circles. Generation riser: 1.0 px, symbol at its foot. Demand drop: 1.0 px to
a 1.4 px load arrow. Exit: a 1.4 px tick in ink 60 % and the far substation's name.
DC link: 2.1 px dotted, a converter symbol near each end.
