# 0017 — The quality pass: what the audit found

**Status:** adopted, after the first full review

The eight phases of the brief were all built and all tested, and the result was
still, in the reviewer's words, "a bit of a mess". That judgement was correct
and the reasons for it were findable. This records what was actually wrong,
because most of it was not a matter of taste.

## The method: measure the frame, do not squint at it

Every finding below came from instrumenting the app rather than from looking at
one screenshot. Two tools now live in `tools/`:

- **`audit.mjs`** captures every view at the scale it is meant to be seen, and
  prints for each one: how many line segments, how many labels, the scale, the
  breadcrumb, the panel title, and which scenes are contributing at what
  opacity. A regression in a view nobody happened to open cannot hide.
- **`guide-walk.mjs`** clicks through all fourteen steps of the guided path and
  reports where each one lands.

The first run of `audit.mjs` found four bugs in ten lines of output. That is
the argument for having it.

## What was actually broken

**The screen went blank.** Below 0.03 m/px every scene had faded out and the
renderer produced zero segments. A reader who kept scrolling in at a substation
fell off the end of the world onto empty paper. There is now a per-position
floor: how far in it is worth going depends on what is modelled underneath, so
it is computed each frame rather than being a global constant.

**The panels described the wrong thing.** Scene dominance was decided by fade
opacity, which cannot tell a drawing that fills the window from one running off
both edges. Standing in the Eden Vale yard the app offered feeder controls.
Dominance is now opacity times how much of the window the scene occupies.

**Three views had no panel at all** — region, plant and machine each fell
through to whatever had been shown last.

**The whole state was drawn at every scale**: 2,755 segments and 43 labels at
1150 m/px, and the same 2,755 and 43 at 90 m/px with the network ten times the
width of the window. Culling by closest approach rather than by bounding box
matters here, because a 400 km diagonal circuit has a bounding box covering
half the state.

**Labels ignored scene opacity**, so a scene at a tenth of its strength still
wrote captions at full black. Standing inside a generator, seven plant labels
were printed over it.

**The camera compensated for the panels on the left and not the right**, so the
guided path flew to a fault and parked it underneath the panel explaining the
fault.

## What was wrong that was not a bug

**The substation yard looked like scattered icons with nothing connected.** The
drawing was correct. Two things made it read as disconnected:

1. Every lead was a straight three-dimensional diagonal between device centres,
   cutting across the bays at angles no conductor takes. A substation is
   orthogonal — the conductor runs horizontally at height and drops vertically
   to each device.
2. Every device was a flat screen-aligned glyph. A symbol is exactly right on a
   single-line diagram and exactly wrong standing in a yard, where it reads as
   a caption pinned over the drawing.

Both are now fixed, and the second is the more important: sliding from Diagram
to Yard turns a symbol into the object it stands for, which is the transition
the whole project is built around and the one this view was failing at.

**Nothing felt lived in, because nothing was drawn but the network.** Line work
on blank paper is how a schematic looks. There are now three ground layers —
the Pacific shore lines, the street grid and houses around the feeder, and an
axonometric cutaway of the house the socket is in. All at the lightest weight
in the palette, behind everything, never labelled.

**There was too much text, and it was the wrong kind.** Every panel opened with
a paragraph; the register was heavy with stacked em-dashes and "which is why"
chains. Roughly halved, and the numbers left to do the work.

## Two rules that had quietly decayed

**Colour.** The alarm vermilion had been borrowed three times, each borrowing
individually reasonable and all three together costing the palette its only
signal: a severity tag on a simplification the model was being candid about;
the device that operates FIRST in a coordination study, which is the protection
working; and a reliability index moving the wrong way under a trade-off the
reader had chosen. All three now use weight, and a test walks the stylesheet
and fails on any use outside a short allowlist.

**The dash.** 115 kV at 1.4 px against 12.47 kV at 1.1 px is not a difference
anybody can see, and those are the two classes that sit side by side inside a
substation. Worse, generator leads were drawn at 12.47 kV, so an 18 kV busbar
three metres long inside a power station carried the dash pattern that means
"the wire along your street".

The test guarding this had encoded a PROXY — solid above 100 kV, dashed below —
rather than the rule, which is that the dash means distribution. When the
generator bus arrived the proxy failed for the right reason and the wrong
cause. Rewritten to assert the rule.

**The general lesson**: a test that encodes a proxy for a rule will eventually
fail on a case the rule permits, and the temptation then is to widen the proxy.
The right move is to write down the rule.

## What is still not right

Recorded honestly rather than quietly dropped:

- **The region scale still has no treatment of its own.** It is the system
  drawing with fewer lines in it. The coast helps; a sense of where the cities
  are would help more, and there is no urban-extent data in the model to draw
  it from without inventing geography.
- **The 20–30 m/px band is a genuine scale gap.** A feeder is three kilometres
  and the state is a thousand; between them the model has nothing, because it
  has one feeder rather than the several hundred a real substation area has.
  The hand-over is now tidy rather than good.
- **The plant and the service views are strung out** across mostly empty pages.
  Their content is right and their layout is not composed.
