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

Nothing is drawn at a scale where it cannot be read, and nothing is WITHHELD at
a scale where it can.

- Houses appear as filled footprints from about two pixels across — the way an
  engraved town map fills its buildings — and become outlines at nine, where an
  outline can be read as one. They used to wait until seven, which sounds like
  this rule but was the wrong reading of it: at the scale where the whole feeder
  fits the page, the scale this level is FOR, a house is four pixels, so the
  view most readers live in was three kilometres of empty ruled paper.
- A city's demand dots appear only once the scatter is about forty pixels
  across. Further out, four hundred dots land on top of each other under the
  site's own symbol and draw a smudge that carries no count and no shape. Big
  cities are legible sooner than small towns, so on the way in they bloom one
  after another rather than speckling the whole state at once.
- The feeder names its equipment from about thirteen metres per pixel and its
  poles from eight. Further out the whole feeder is a hundred-pixel clump, and
  four two-line captions around a smudge mean the text IS the drawing.
- The street grid stops before the substation, where a block is wider than the
  page and reads as a stray construction line across the yard.
- In the yard, only the busbars, the transformer banks and the line terminals
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

Inside the fence there is more than the equipment: the substation has its
control house, cable trench, access road and gate; the power station has its
control building, water plant, road and the gas arriving from off site. None of
it carries current, which is exactly why the single-line diagram has no symbol
for any of it — and why a yard drawn only from the one-line comes out as
equipment standing in an empty field with a quarter of the site conspicuously
containing nothing.

All of it at the lightest weight in the palette, behind everything, barely
labelled: at a glance it is texture, and only on a second look is it a
neighbourhood. The coastline is real Census boundary data; the streets and
houses are invented and the honesty register says so, but their DIMENSIONS are
the ordinary ones of American suburban development, so the sense of scale is
honest even though the particular houses are not.

## Type is placed where the drawing is not

The label layout knows where every other label is, and — since the second
quality pass — where the drawing is. Each frame is rasterised into cells a
dozen pixels across and every candidate position is scored by how much ink it
would be written over; the conventional order (up-right, up-left, down-right…)
survives as the tie-break, so nothing moves when there is nothing to avoid.
Ghost line work counts for a third of a conductor, because at feeder scale the
ground is everywhere and treating a street as an obstacle would leave no clear
paper to prefer.

What this fixed was not the NUMBER of labels. It was a caption landing in the
middle of a five-circuit corridor with a hand's width of empty paper beside it.

**No caption is ever written under a panel.** The panels' rectangles are
measured from the page on each rebuild and given to the layout as obstacles; a
label with nowhere left to go is dropped, which is what the layout does with
everything it cannot place legibly. A caption behind a panel is not a faint
caption — it is an absent one that took the space another caption could have
used, and it leaves a leader line emerging from under a panel pointing at
nothing.

A label may also state which side of its subject it belongs on. That is what
turns the service view from scattered annotation into a labelled diagram: the
equipment named above the chain, the wires between them below. It is a
preference and not a restriction — a caption with nowhere to go on its own side
is still placed.

## The drawing never writes the same number twice

A substation single-line names a line terminal, its breaker, its disconnect and
the bus behind it, and every one of them carries the same current. Four captions
in a column all reading `13.7 MVA · 8 %` do not reinforce anything; they bury
the numbers that ARE different. A value line is written by whichever label ranks
highest and the rest keep their names and drop the repeat — enforced in the
layout rather than as a list of exceptions in each scene, so the next scene
somebody writes cannot forget it.

Two related rules, in the same spirit:

- **A pole keeps its name and loses its voltage.** Twenty scattered four-decimal
  readings are the voltage-profile plot written out badly. The plot is
  underneath, where the drop along the feeder, the step at the regulator and the
  lift at the capacitor are visible at once and in order.
- **At whole-state scale only the gigawatt sites carry a number.** The symbol
  already says how big a place is; come closer and the threshold drops to
  nothing.

## How much the drawing says out loud is the reader's choice

A reader who knows what they are looking for wants every name and every number;
a reader meeting a power system for the first time wants a drawing they can take
in. The same scenes serve both, and the difference is one setting rather than
two code paths.

| Setting | What it prints |
|---|---|
| **Least** | The names you need to orient, and nothing else. No values anywhere. |
| **Normal** | Names, and a number where the number is the point. The default. |
| **All** | Every name each scene can give, with a number under all of them. |

It governs **type only**. No setting changes a line, a symbol or a solution: it
is the same drawing, differently annotated. Each scene applies it at its own
existing gates, because only the scene knows which of its captions is the one
worth keeping when there is room for one.

What makes *Least* quiet rather than lossy is the rule below.

## A level leads with one line and opens up when asked

Information is not free because it is true. Every level used to open with
everything it had to say, so arriving anywhere meant reading three paragraphs
before looking at the drawing — and the drawing is the thing that was supposed
to be doing the explaining.

The first line stays. The rest sits behind a disclosure whose summary is
phrased as the question it answers — *How to read the streams*, *Why the rotor
is drawn on a slant*, *The four ratios a system is planned with* — so the click
is worth making, and so a reader who does not need it is not made to read past
it. The summary is marked the way a glossary term is marked, because it is the
same promise: there is more here if you want it.

## The legend is the filter

A key that explains an encoding is the obvious place to ask for one part of it:
it is already on the page, it already names every class, and it needs no second
control to be discovered. Clicking **500 kV** in the legend is the natural way
to ask "so where does the backbone actually go".

**It recedes the rest, it does not delete them.** Hiding the other classes
answers that question and destroys the one worth asking, which is where the
backbone runs RELATIVE TO everything else — the whole point of a backbone is
what it is the backbone of. Kept at two thirds of its weight in the faintest
ink, the rest of the network stays as the ground the chosen class is read
against. The travelling flow marks stop on the recessive classes, so motion
belongs to the class being held up.

## Everything answers when pointed at

Every pickable thing carries a two-line readout — its name and one live value —
supplied by the scene that drew it, because the scene is the only thing that
knows both what the object is called and what the solver says it is doing.

That is what lets the drawing carry less type without carrying less
information. It is also the answer to the thing a map can never do: a hundred
and forty circuits cannot all be named on one page, so without it the thing the
drawing is mostly made of would be the one thing a reader could not identify.

**And the drawing says where the depth is.** Two of the sixty places on the map
open into levels of their own, and nothing on the page said which: a reader
could sweep the whole state without ever learning that one of these circles is
a substation they can walk into and another is a power station they can take
apart. The breadcrumb names the levels; it cannot say which dot leads to them.
Their readouts do.

## The legend is a key to the page, not a catalogue

Always present and always complete — where complete means *everything on the
page*, not everything the renderer can draw. At the whole state the legend used
to offer the wire along a street and the drop into a house, neither within four
orders of magnitude of being visible, and the rows that mattered were below the
fold.

Each scene declares the voltage classes it draws, beside the code that draws
them; the compositor reports the union of the scenes it composed; the legend
shows that. A test checks that the scenes account for every class in the
palette, so none can quietly become legend-only. The machine marks, the size
key and the dot key appear on the same terms — reported by the frame, never
inferred from the level.

## Framing a solid, not its footprint

A ground rectangle is the right description of a map and the wrong one for a
substation: the yard is eighty metres across and stands twelve metres up, and
in an isometric projection that height is most of what the drawing occupies.
Bounding boxes carry their height, and the camera frames what is drawn rather
than the plot it stands on.

Framing also asks what panels the DESTINATION will have rather than what is open
now, so the same journey always lands at the same size. `tools/navigate.mjs`
walks all forty-two journeys between the seven levels and fails if it does not.

## Depth comes from line weight and occlusion

No gradients, no glows, no drop shadows, no rounded cards. Separation between
panels comes from a 1 px rule and space.

The one permitted "shadow" is the ground-coloured halo behind map labels, which
is the typographic equivalent of the hidden-line removal in the drawing itself.

## Motion only where it carries information

Marks in the colour of the paper travel along the core of each conductor at a
speed proportional to loading, in the direction real power is going. Nothing
else in the interface animates: no entrance animations, no hover flourishes.

**The marks are beads, not stripes.** At a 15 px pitch with each mark four
tenths as long as the gap and nearly as wide as the conductor, a 500 kV corridor
of three parallel circuits came out as three barber's poles and a page of them
read as hatching. A 26 px pitch, marks under a fifth of it, and a bead never
more than half the width of the line say exactly the same thing and leave a
conductor looking like a conductor.

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
