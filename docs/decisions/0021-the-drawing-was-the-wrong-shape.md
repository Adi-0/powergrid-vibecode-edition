# 0021 — The drawing was the wrong shape

**Status:** adopted, after the fifth review

The reviewer sent one screenshot — the machine view — and a sentence that
covered far more than it: *graphics could be much better for buildings, the
machine, and practically many other things… from a user human side it's to the
point it's really difficult to navigate and comprehend at times, down to even
being completely hard to understand.* Plus: *there seems to only be one
substation, one feeder… I can only zoom in on one specific area for each, and
they regardless fade in/out unreliably.*

Most of it turned out to be one bug.

## The canvas was 748 px tall and the camera thought it was 846

`Viewport.resize()` measured the stage once, in the constructor, before the
footer had been laid out. The renderer is deliberately called with
`setSize(w, h, false)` — the CSS grid owns the canvas's size, not three.js — so
when the stage settled to its real height nothing told the camera, and an
846-tall drawing buffer was displayed in a 748-tall box for the rest of the
session.

**That squashes the whole drawing by twelve per cent in one axis.** An
isometric projection stops being isometric. A machine section drawn square to
the page comes out an ellipse, which is exactly what the reviewer's screenshot
shows and is why the machine looked subtly wrong in a way that was hard to name.

It is much worse than it looks, because **all the screen-space work is done in
the camera's coordinates**: label placement, leader lines, the ink map that is
supposed to keep type off the drawing, and hit-testing. Every one of those ran
in a space 98 px taller than the one on the screen, so every caption was
displaced from its own anchor, further the further down the page it sat. A
label the layout believed was 40 px clear of the 115 kV bus was drawn lying
across it. That is most of "really difficult to comprehend", and it made the
ink-avoidance machinery look as though it did not work when in fact it was
working on the wrong page.

A `ResizeObserver` on the stage, rather than a single measurement plus the
window's resize event — the stage also changes size when a panel opens.

**How it was found, which is the part worth keeping.** By refusing to believe
the screenshot. The layout said the caption had no ink under it; the screenshot
said it was on the busbar. Rather than tune the threshold until the picture
looked better, the ink field was dumped out of the page and compared against
the bus's own projected position, then the DOM label's `getBoundingClientRect`
was compared against both. The label layer's box and the camera's viewport
disagreed by 98 px and that was the whole answer.

## Type is not written over line work

Two changes, now that the measurements mean something.

- **A ceiling, not a preference.** The layout scored candidate positions by the
  ink under them and then took the least-inky one, which on a substation
  single-line — a dense grid of bus bars with drops every few pixels, and no
  clear paper anywhere near any device — still meant writing across the bus.
  There is now a limit, measured PER CELL so a two-line caption is not
  penalised for being bigger. It is set low enough to separate a line running
  ALONG a caption from one crossing it: a conductor cutting a corner is barely
  noticed, a busbar running the length of it makes both unreadable.
- **Somewhere to go.** A caption can now walk out to five times the standard
  offset on a leader, in rings that all face INTO the drawing. That is what a
  draughtsman does on a crowded sheet, and the near ring alone could never
  offer it.

**And then it put six names in the sea**, which `tools/label-geography.mjs`
caught the same afternoon. Refusing to write over the drawing sends a caption
looking for clear paper, and off the coast of California the cleanest paper is
the Pacific. San Diego, Miguel, San Onofre, Imperial Valley, Oakland and San
Gorgonio Pass all jumped offshore onto hairline leaders, reading as names for
the ocean — exactly the fault 0019 had fixed, reintroduced from the other side.

Two things separate the two cases, and neither is "how much ink".

**Whether there is an edge to fall off is a property of the scene.** A
substation single-line has no coast; the state has one. The distance a caption
may be led is now declared per scene by the compositor — the one place that
knows which of its scenes are drawings and which are maps. The substation, the
service, the plant and the machine may lead a caption out to five times the
standard offset; everything else keeps it beside its point.

**Direction matters as much as distance.** "Inward" means within a right angle
of the middle of the ink, and from San Diego that includes along the coast as
well as up it, so a caption let out three offsets could follow the shoreline
out over the water. A map still gets two rings at arm's length, but only in the
directions pointing squarely inland — the move a cartographer makes, and worth
several names that would otherwise be dropped for want of anywhere to sit.

**And the passes are ordered so that staying on the subject beats finding clean
paper**: inward on clear paper, then inward anywhere, and only then beside the
point facing outward. A name written over a conductor is a nuisance; a name in
the sea is wrong.

Thirty-three labels placed with two off the subject, against thirty-six placed
and three off before any of this — and no type lying across a busbar anywhere.

## A machine section is a standard drawing; this one now is

The old cross-section was six concentric circles of the same weight with
eighteen crosses floating in the annulus between them, a blue line through the
middle for the rotor, and a sixteen-degree smear of the same blue on the
outside for δ. Nothing was filled, so nothing was solid; the coil sides sat in
the middle of the iron rather than in slots; and the one part of the machine
that moves was drawn in the colour this app reserves for something being wrong.

A machine section has a settled vocabulary and using it costs nothing:

- **Iron is hatched** at 45°, clipped to the annulus of the core.
- **Slots are cut into the bore**, twelve of them, with teeth between.
- **Conductors are marked for direction** — ⊗ into the page, ⊙ out of it. A
  coil is a loop, and a section through a loop is two conductors with the
  current going opposite ways, so those two symbols are what lets a drawing
  show a winding at all.
- **Twelve slots, two poles, three phases** divides exactly: two slots per
  phase per pole. That is the smallest winding that is a real one rather than a
  picture of one, and the arithmetic is the lesson.
- **The rotor is a two-pole round forging** with the field winding in slots and
  two unslotted pole faces, drawn heavier. The field is ONE coil: the current
  goes down every conductor on one side of the direct axis and back up every
  conductor on the other, which is the whole of why one end is north. Splitting
  it by pole instead — which the first attempt did — draws a coil that cannot
  exist.
- **Axes are chain lines**, so the two lines that are not parts of the machine
  cannot be mistaken for parts of the machine.
- **δ is dimensioned**, as an arc with a tick at each end, outside the frame.
  Drawn across the hatched core it read as a part of the machine.

No colour anywhere in it.

## One substation is the scope; not saying so was the fault

The atlas works one example all the way down, on purpose, and the register says
so. What was wrong is that nothing on the page said WHICH of forty-odd circles
were the two that open, so the only way to find out was to zoom in on all of
them — and zooming in on the wrong one was punished:

**Wheeling in over open country stopped at 20.5 m/px on a page with two
segments and no labels on it.** The floor that decides how far in it is worth
going asked whether each scene's bounding box overlapped the window, and the
transmission scene's bounding box is the whole state, so the answer was yes
over every acre of California — including the acres with nothing on them. The
floor now asks whether any circuit or site is actually within the window, by
clipping each one against it, and when nothing is near it holds the reader at
the scale where the whole-state drawing is still fully drawn instead of the
scale where it has just vanished.

And the two ways in are marked: **corner brackets**, which is what a drawing
office puts round the part of a general arrangement that is detailed on another
sheet, with `zoom in to go inside` under the name and a row in the legend. Both
are named before anything else on the map now — Eden Vale is a 115 kV
substation with a few tens of megawatts through it and was losing its caption
to thirty larger places, while being the door into three of the seven levels.

## What is still not right

- **The Bay Area is a tangle** at whole-state scale: a dozen sites inside forty
  kilometres, with parallel circuits between all of them. The region level is
  supposed to be the answer and still has no treatment of its own.
- **Only one worked example**, which is scope rather than a defect, but the
  honest form of it would be a second substation on a different feeder so the
  reader could compare two rather than trust one.
- **The 20–30 m/px gap** is carried forward from 0018 and 0019 unchanged.
