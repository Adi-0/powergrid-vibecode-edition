# The visual language

The reference is technical drawing — patent illustration, axonometric
architectural section, cutaway engineering diagram. Not a dashboard, not a
landing page. It should read as a precision instrument.

Everything below lives in `src/render/style.ts`, and the parts that can be
checked mechanically are checked by `test/visual-language.test.ts`.

---

## Ground and ink

| Role | Value | Use |
|---|---|---|
| Ground | `#EFECE4` | The paper. Warm off-white, the colour of drafting stock. |
| Ink | `#14161A` | The pen. Near-black with a trace of blue, as printing ink is. |
| Ink, muted | `#5C5953` | Secondary text and units. |
| Ink, faint | `#8E8B84` | Structural line work that must recede. |
| Ink, ghost | `#C8C4BA` | The faintest readable mark: rules, ticks, the coastline. |

Every one of these has a **chroma below 0.05** — measurably near-neutral. That
is not an aesthetic preference; it is what makes the next rule work.

## Colour means exactly one thing

`#C4341B`, a vermilion. It appears **only** for: over a thermal limit, outside
voltage limits, faulted, protection operated, load shed, out of service.
Nothing else in the drawing is ever coloured.

The single permitted exception is the selection highlight, `#1B4E8C`, which is
the cursor rather than a claim about the power system — and is a cool hue
specifically so it can never be confused with the alarm.

## Voltage class is encoded by line weight, never by hue

| Class | Weight | Pattern |
|---|---|---|
| 500 kV | 3.2 px | solid |
| 230 kV | 2.1 px | solid |
| 115 kV | 1.4 px | solid |
| 12.47 kV | 1.1 px | dashed 7 / 3.5 |
| 240 V | 0.8 px | dashed 2.5 / 2 |

Each step down is roughly 0.65 of the one above — the smallest ratio that stays
legible side by side at normal viewing distance. Transmission is solid and
distribution is dashed, which is the convention on utility system maps and also
separates the two families at a glance when they appear in the same view.

Widths are **screen pixels, held constant as the camera zooms**. See decision
0006 for how.

A drawing that uses colour for voltage cannot be photocopied, cannot be read by
a colour-blind reader, and cannot then use colour for anything that matters.

## Depth comes from line weight and occlusion

No gradients, no glows, no drop shadows, no rounded cards. Separation between
panels comes from a 1 px rule and space.

The one permitted "shadow" is the ground-coloured halo behind map labels, which
is the typographic equivalent of the hidden-line removal in the drawing itself.

## Motion only where it carries information

Marks in the colour of the paper travel along the core of each conductor at a
speed proportional to loading, in the direction real power is going. Nothing
else in the interface animates: no entrance animations, no hover flourishes.

The one other motion is the level transition, which exists to show what changed.

## Type

**IBM Plex Sans**, bundled rather than loaded from a CDN so the app works
offline and looks the same everywhere. Plex was drawn for IBM with explicit
reference to industrial and drafting lettering, which is the register this
wants, and it has proper tabular figures.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Readout | 13 px | 500 | 0.01em |
| Label on the drawing | 11 px | 500 | 0.02em |
| Annotation | 9.5 px | 400 | 0.03em |
| Panel heading | 12 px | 600 | 0.06em |
| Body | 13 px | 400 | 0 |

**Every number in the interface is set in tabular figures.** This is not
decoration: a readout whose digits change width jitters on every update and
cannot be read.

There is no monospace face here, deliberately. Setting labels in monospace to
look technical is a costume; tabular figures in a real text face is what
engineering drawings actually use.

## The isometric projection

Azimuth 45°, elevation arctan(1/√2) ≈ 35.264°, held as a single constant. That
direction is equally inclined to all three world axes, which is what makes the
projection isometric: the three axes project 120° apart and equal world lengths
draw as equal screen lengths. Any other elevation is axonometric but not
isometric, and the giveaway is that a cube stops looking like a cube.

Orthographic, not perspective, because a technical drawing has no vanishing
point: two objects of the same size must draw the same size wherever they sit,
or the drawing stops being measurable.

## Symbology

Standard one-line diagram symbols throughout — the ones a person will meet again
on a real utility drawing, a relay panel or a textbook. A circle is a machine,
two interlocking circles are a transformer, a heavy bar is a bus, a square is a
breaker, a blade opening away from its contact is a disconnect. Protection
carries ANSI/IEEE C37.2 device numbers.

Where no standard exists — and there is none for telling a wind farm from a
solar farm on a one-line — a mark goes inside the machine circle and is
**declared in the legend as this drawing's own convention**, rather than
reaching for colour.

## The legend

Always present, always correct, always complete. It is generated from the same
constants the renderer draws with, so it cannot drift out of date. A legend
maintained by hand is a legend that is wrong by the third commit.

## Labels

DOM elements in screen space, never geometry in the scene. Type must not be
projected: a label drawn as 3D geometry gets sheared by the isometric
projection and becomes a different, worse typeface at every angle.

Each frame every candidate is projected, ranked by importance, and placed only
if it does not collide with something already placed. What does not fit is
dropped, not squeezed — forty overlapping labels convey less than twelve placed
ones. A hairline leader connects a name to its subject when the two have been
pushed apart.
