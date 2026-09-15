# 0018 — The second quality pass: measuring the parts nobody screenshots

**Status:** adopted, after the second full review

Decision 0017 recorded what was wrong when the eight phases were first
reviewed, and fixed most of it. This records the second pass, which went after
three things the first one could not see: what happens BETWEEN views, what the
type is sitting on, and what a panel does when its content is taller than it is.

## The method, again, but on the parts that move

`tools/audit.mjs` captures every view at rest. That is the right instrument for
"is this view composed" and no instrument at all for "does getting there work".
Two more tools now live beside it:

- **`navigate.mjs`** walks all forty-two ordered pairs of the seven levels and
  fails if a destination is reached at a different scale depending on where the
  journey started. It found three separate bugs on its first run.
- **`crop.mjs`** renders one view at three times device scale and cuts out a
  rectangle, because line weights, dash patterns and whether a transformer reads
  as a transformer cannot be judged from a 1440-pixel screenshot.
- **`states.mjs`** captures the app in the states a reader can put it in — a
  tripped backbone, a fault on a busbar, a car charger at one house, a motor
  starting at the end of the feeder — because that is where the one signal
  colour earns its place and audit.mjs never visits any of them.

## The zoom really was broken, and this is what was wrong with it

The reviewer said zooming in was buggy. It was, and it was one bug.

The compositor computes a FLOOR each frame — how far in it is worth going at
this position, so that a reader wheeling in over open country stops where the
last drawing fades out rather than sailing on into a blank page. That floor was
also being applied to commanded flights. Half way across the state on the way
to one house, the only thing under the camera is a distribution feeder, whose
floor is a third of a metre per pixel; the flight stopped there, finished, and
left the reader looking at a street from three hundred metres up wondering why
zooming had stopped working. Because it depended on the route, it came and
went — which is the worst kind of bug to be told about and the easiest kind to
find with a matrix.

The floor is about where the camera IS. A flight is about where it is going,
and a destination the application chose is legible by construction. Flights and
framing now set the scale exactly; the floor keeps doing its real job.

The same matrix caught two more: every destination reached FROM the machine was
framed around the capability panel, which closes on the way out. Framing now
asks what panels the destination will have, not what is open now.

## Framing a solid, not its footprint

The substation yard filled less than half the width of an otherwise empty page
and sat in the top-right of it. Both faults came from the same missing
dimension: the camera framed a ground rectangle, and a yard eighty metres
across that stands twelve metres up is mostly height on the page in an
isometric projection.

Boxes carry `minY`/`maxY` now, the camera projects eight corners instead of
four, and it centres what is drawn rather than the plot it stands on. Three
levels that were placed at a guessed metres-per-pixel are framed instead.

A second cause was hiding behind the first: the substation's bounding box was a
square as wide as the yard is long with a further tenth on top — more than twice
the area of the station. The schematic frame is now scaled to land inside the
same box, so the morph between diagram and yard reads as one station changing
rather than two drawings of different sizes swapping over.

## Type was being written on top of the drawing

The map looked like a mess and the number of labels was not why. The layout
knew where every other LABEL was and nothing whatever about the drawing it was
writing on, so a caption would land in the middle of a five-circuit corridor
with a hand's width of empty paper beside it.

Each frame is now rasterised into cells a dozen pixels across and every
candidate position is scored by the ink under it, with the conventional order
as the tie-break. It costs between a fifth of a millisecond and one and a
quarter, measured at every level.

Three rules cut the text itself, each enforced where it belongs:

- **The drawing never writes the same number twice.** A substation one-line said
  `13.7 MVA · 8 %` four times in a column, because a line terminal, its breaker,
  its disconnect and the bus behind it all carry the same current. Enforced in
  the layout, so no scene can forget it.
- **A pole keeps its name and loses its per-unit voltage.** Twenty scattered
  four-decimal readings are the voltage-profile plot written out badly.
- **At whole-state scale only the gigawatt sites carry a number.** The symbol
  already says how big a place is.

## The legend was complete in the source and truncated on the screen

"Always present, always correct, always complete" was true of the code and
false of the experience: eight groups and twenty-five rows in a panel a third
the height they needed. A reader saw the voltage classes, a heading, and a
horizontal cut, and never learned that the scatter of dots was demand.

Three changes, in order of how much they bought. The left column became a
column, so the controls and the legend share the height instead of each
claiming a fixed fraction of it. The legend became a key to what is on the page
— each scene declares the voltage classes it draws, the compositor reports the
union, and a test checks that the scenes account for the whole palette. Symbols
and machine marks went two to a line.

## What the drawings were missing

**Flow marks were stripes, not beads.** A 15-pixel pitch with marks four tenths
as long and nearly as wide as the conductor turned a 500 kV corridor of three
parallel circuits into three barber's poles.

**The feeder ran through empty ruled paper.** Houses waited until they were
seven pixels across, which sounds like detail-on-approach and is the wrong
reading of it: at the scale where the whole feeder fits the page — the scale the
level is for — a house is four pixels. They are drawn as filled footprints now,
the way an engraved town map fills its buildings, and become outlines when an
outline can be read.

**Everything inside a fence that carries no current was missing.** The
single-line diagram has no symbol for the building the protection lives in or
the road the crew drives in on, so a yard drawn from the one-line alone came out
as equipment in a field with a quarter of the site conspicuously empty. The
substation has its control house, cable trench and access road; the station has
its control building, water plant, road and the gas arriving from off site.

**The demand scatter re-rolled as the clock ran.** Its extent came from the load
on show, so every hour redrew the dice. It comes from the site's annual peak
now, which is a property of the place, and the hour decides only how many dots
are drawn. Each site also decides whether it is close enough to be worth drawing
at all.

## What the states found

`audit.mjs` captures every view with nothing wrong, which is half the app. The
other half is what happens when a circuit is out, a bus is over its limit or a
fault is on the feeder — where the one signal colour earns its place, and where
a drawing is most likely to be quietly wrong. `tools/states.mjs` captures four
of those, and found two things in its first run:

- **A fault on a substation busbar was drawn nowhere.** Twenty-three thousand
  amps in the coordination panel, beside a drawing with nothing wrong in it.
  The feeder had always marked its faults; the yard now does too.
- **The panel explaining a thing was covering the thing.** Selecting a 500 kV
  circuit and opening the working put a four-hundred-pixel panel and a
  six-hundred-pixel one over the map. The camera now pans by the smallest
  amount that brings the subject back into the paper still showing — never
  zooms, because the scale is the reader's.

Two related fixes followed from the same look:

- **No caption is written under a panel.** The layout knew about the drawing
  and nothing about the panels lying over it, so a name could be placed behind
  the legend and the reader saw a leader line emerging from under a panel
  pointing at nothing. The panels' rectangles are measured from the DOM on each
  rebuild and passed to the layout as obstacles.
- **The appliance buttons did not follow the state.** The guided path switches
  everything off at 14 Cherry Lane on its way past, and the buttons went on
  showing whatever was last pressed. The motor controls have taken their state
  from the state since they were written; the appliances now do too.

## The one thing you could not find out without clicking

Sites are named on the drawing and circuits are not, because a hundred and forty
names on one page is a word search rather than a map. That left the thing the
drawing is mostly made of as the one thing a reader could not identify at all
without selecting it — a large part of what "hard to learn or discover anything"
meant. Hovering a circuit now reads out its name and what it is carrying, in two
lines, beside the cursor.

"Show me around" also stopped being quiet. Five of the six buttons along the
footer are reference for a reader who already has a question; the sixth is for a
reader who does not yet know what to be curious about, and it was the same
weight as the others.

## What is still not right

Carried forward from 0017, honestly:

- **The region scale still has no treatment of its own.** The demand dots help a
  great deal — the network visibly goes where the people are, which was the
  whole complaint — but it is still the system drawing at a regional scale.
- **The 20–30 m/px band is still a scale gap.** It is now tidy: the feeder stops
  naming its equipment there and the breadcrumb agrees with the panel. It is
  still one feeder where a real substation area has hundreds.
- **The plant is composed along one diagonal.** A 260 × 170 m site drawn
  isometrically has two large empty corners and the energy chain runs along the
  axis between them. The scenery fills one; the other is honest empty tarmac.
- **Two identical trains lose one of their two identical numbers.** "The
  drawing never writes the same number twice" is the right rule for a series
  chain, where four devices carrying the same current were captioned with it
  four times. Applied to a plant with two identical gas turbines it leaves one
  of them captioned `205 MW` and the other captioned nothing, which reads as an
  asymmetry that is not there. The rule stays, because the case it was written
  for is much commoner and much worse.
