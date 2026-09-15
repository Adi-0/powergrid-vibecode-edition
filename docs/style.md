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

**This rule decays quietly.** Three borrowings had crept in before a test
caught them, each individually reasonable: a severity tag on a simplification
the model was being candid about; the device that operates FIRST in a
coordination study, which is the protection doing its job; and a reliability
index moving the wrong way under a trade-off the reader had just chosen. All
three now use weight. `test/visual-language.test.ts` walks the stylesheet rule
by rule and fails on any use of the alarm colour outside a short allowlist,
and the allowlist has to keep matching real selectors so it cannot rot into a
rubber stamp.

## Voltage class is encoded by line weight, never by hue

| Class | Weight | Pattern |
|---|---|---|
| 500 kV | 3.2 px | solid |
| 230 kV | 2.1 px | solid |
| 115 kV | 1.4 px | solid |
| 18 kV generator bus | 1.1 px | solid |
| 12.47 kV | 0.9 px | dashed 7 / 3.5 |
| 240 V | 0.6 px | dashed 2.5 / 2 |

Each step down is roughly 0.7 of the one above — the smallest ratio that stays
legible side by side at normal viewing distance. 115 kV and 12.47 kV were once
1.4 and 1.1 px, which is not a difference anybody can see, and those are
precisely the two classes that sit next to each other inside a substation. The
weights now separate.

**The dash means distribution, not low voltage.** It marks the wires on the
poles along a street and the drop from the pole to a building, and nothing
else. Voltage was a usable proxy for that until the generator bus had to be
drawn: 18 kV, three metres of enclosed busbar inside a power station, which
dashed would have claimed was the wire outside your house. A test asserts the
rule as the rule rather than as the proxy, and a second asserts that weight
stays monotonic in voltage, which is the legend's actual claim.

Widths are **screen pixels, held constant as the camera zooms**. See decision
0006 for how.

A drawing that uses colour for voltage cannot be photocopied, cannot be read by
a colour-blind reader, and cannot then use colour for anything that matters.

## Size means quantity

A site symbol is drawn larger where there is more: installed generating
capacity where there are machines, peak demand where there is load. Square
root, so a four-gigawatt station is about six times the area of a
hundred-megawatt one rather than forty and off the page.

It used to be the highest voltage present, in three buckets, which meant a
2.26 GW nuclear station and an empty 500 kV switchyard were drawn identically.
At a glance the most useful thing about a site is how much machine is there,
and the model already knows. Voltage keeps the stroke weight; size is a
separate channel carrying a separate fact, and the legend says so.

## A fading drawing thins as well as pales

Where two levels cross-fade, the one being left behind loses line weight along
with opacity, and the gap between parallel circuits closes at the same rate.
Half-way through the hand-over from the transmission network to a feeder, full
width at partial opacity produced two forty-pixel grey bands crossing a page
whose subject was three kilometres of street. Pale wide bands read as damage.
Thin ones read as a drawing dissolving, which is what is happening.

Labels do the same, more bluntly: a label carries the opacity of the scene that
emitted it, and below a third it is not drawn at all. A caption at ten per cent
is not a faint caption — it is unreadable grey text sitting on top of the
drawing that replaced it.

## Detail arrives as you approach

Nothing is drawn at a scale where it cannot be read. Houses in the
neighbourhood layer wait until they are seven pixels across. Pole names on the
feeder wait until the poles are far enough apart to point at — until then only
the equipment is named. In the substation yard, once the drawing has stood up
into a yard, only the busbars, the transformer banks and the line terminals
keep a standing label, because with a volume under every caption the drawing
disappears under its own text.

The rule is the same in each case: a mark that cannot be read is not
information, it is noise with a cost.

## The ground is drawn, because a power system is not in a void

Line work on blank paper is how a schematic looks, and this is not a schematic.
The Pacific coast gets the shore lines engraved maps have used for three
hundred years. The feeder gets the street grid it runs along and the footprints
of the houses it serves. The service gets an axonometric cutaway of the house
the socket is in.

All of it at the lightest weight in the palette, behind everything, never
labelled: at a glance it is texture, and only on a second look is it a
neighbourhood. The coastline is real Census boundary data; the streets and
houses are invented and the honesty register says so, but their DIMENSIONS are
the ordinary ones of American suburban development, so the sense of scale is
honest even though the particular houses are not.

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
