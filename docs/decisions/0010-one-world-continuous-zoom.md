# 0010 — One world, one camera, continuous zoom

**Status:** adopted, phase 4

## The problem

The brief names the zoom tree — system, region, substation, feeder, service —
and then says the thing that actually matters:

> The transitions are the lesson. A thing at one level must visibly become its
> constituent parts at the next... This is the most important design idea in the
> project.

The obvious implementation is a set of views with a mode switch: a system view,
a substation view, a feeder view, each with its own camera and its own
coordinate system, and an animated wipe between them. That is how nearly every
zoomable interface is built, and it makes the transition a *claim* — a piece of
choreography asserting that this substation is inside that region. The reader is
told about the relationship rather than shown it.

## The decision

**There are no levels. There is one world, in metres, and one camera.**

Every drawing in the app lives at its true coordinate relative to every other
one. The 500 kV line from Malin, the Eden Vale switchyard, the poles along
Cherry Lane and the socket in the kitchen are all in the same space. Travelling
from the whole state to that socket is a single continuous zoom of about sixty
thousand to one, with no cut, no reload, and no second copy of anything.

What changes with scale is only *which drawings are worth rendering*. Each scene
declares the range of metres-per-pixel at which it is legible, with a fade at
each end (`ENVELOPE` in `src/app/scenes.ts`). In the overlap both are drawn, from
the same solved case, so a reader watches the site symbol for Eden Vale dissolve
into a fenced yard, or watches a single 12.47 kV branch resolve into a line of
poles with a recloser on it. The numbers agree across the transition because they
are the same numbers.

The envelope boundaries are not taste. They come from asking what the subject
measures and how many pixels that is: the Eden Vale yard is 80 m, legible from
about 0.30 m/px (270 px across, the smallest that still reads as a yard) down to
0.045 m/px (1,800 px, by which point it has outgrown the window).

### Two consequences worth naming

**Scenes are drawn coarsest first.** Where two overlap, the finer drawing lands
on top and its halos erase the coarser lines running behind it. That is the same
painter's-order compositing decision 0006 adopted inside one view, applied one
level up.

**Halos fade with their ink.** A halo at full strength behind a half-faded
stroke punches a solid hole in whatever is showing through, and the cross-fade
reads as an erasure rather than a dissolve.

## The hierarchy problem, and what we did about it

The zoom tree in the brief is the ELECTRICAL order: power goes system → region →
substation → feeder → service. Spatially that order is not monotonic. A
substation yard is eighty metres across; the feeder leaving it is three
kilometres long. By scale alone the feeder sits *above* the substation, and a
reader zooming steadily in passes region → feeder → substation → service, which
is electrically backwards.

Both orderings are real and the app uses each where it belongs.

- **Scale decides what is drawn.** `levelForScale` answers "how much detail is
  legible here", which is what the legend and the model-honesty panel need.
- **The breadcrumb presents the electrical order**, and every entry in it is a
  place the reader can travel to. Clicking *Feeder* after *Substation* zooms out
  and then in, because that is what walking out of the substation gate and down
  the street actually is.

Rejected: reordering the breadcrumb to match the zoom. It would teach the wrong
thing about what contains what, and what contains what is the point.

Rejected: forcing the feeder to be drawn at substation scale so the orders
agree. Three kilometres at 0.1 m/px is thirty thousand pixels.

## The substation is the same idea one scale down

Inside the fence the same principle is applied to a different pair of
representations. A substation has a physical yard and a single-line diagram, and
the relationship between them is the thing that is hard to learn. Rather than
offering two drawings, `scene-substation.ts` holds both coordinates for every
element and interpolates: slide the control and the diagram lying flat stands up
into the yard, or the yard collapses into the drawing.

This needed one non-obvious piece of machinery. Laying the schematic flat on the
isometric ground plane shears it into a parallelogram, and a sheared single-line
diagram is not a single-line diagram — the whole value of the drawing is that
buses are horizontal and bays are vertical. So the schematic frame is built from
the camera's **ground basis**: the two ground-plane vectors that project to one
screen pixel right and one screen pixel down. Schematic coordinates are then
screen-aligned while still living in the world, so the diagram is square on the
page, scales with zoom like everything else, and interpolates to the yard with
no change of representation.

The first attempt drew buses as fixed spans along world X. Under the projection
they came out as long diagonals cutting across the whole drawing, and the
connections looked like a random web. The screenshot of that version is the
reason this file exists.
