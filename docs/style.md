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
| 500 kV | 4.6 | solid | Bulk transmission |
| 230 kV | 3.0 | solid | Transmission |
| 115 kV | 2.1 | long dash 18/5 | Transmission |
| 60–70 kV | 1.6 | chain (dash-dot) 14/4/2.5/4 | Subtransmission |
| 4–35 kV | 1.25 | solid | Primary distribution |
| 120/240 V | 0.9 | short dash 7/4 | Secondary and service |

Weights are pen widths: constant on screen at every zoom, as on a drawing.

(Expanded in phase 3.)
