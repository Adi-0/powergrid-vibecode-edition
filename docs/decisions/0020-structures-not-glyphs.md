# 0020 — Structures, not glyphs

**Status:** adopted, after the fourth review

The reviewer's judgement, with a screenshot of the plant and one of the
service beside it: *diagrams like these are functionally great, but visually
confusing. The flat icons overlaid and loosely wired don't really feel
immersive — can we create actual "structures" for the project, in that
minimalist, isometric way?*

That is a correct reading of what those two levels were. Everywhere else in
the atlas the drawing is the subject: a corridor of conductors, a yard of
equipment, a rotor on a slant. On the plant and the service the drawing was a
plan with symbols pinned over it, and a symbol pinned over a plan is a label
for a thing, not the thing.

## What was actually wrong with a symbol on a plan

A flat screen-aligned glyph occupies no space. A gas turbine was a trapezoid,
a heat-recovery boiler twenty-six metres tall was a striped rectangle, and a
mechanical-draught cooling tower was four circles — which is exactly what a
cooling tower looks like from directly above and from nowhere else.

The consequence is not that it looks worse. It is that the widths of the
energy streams were doing all the work, and the equipment they ran between
read as annotation on them. A combined-cycle station is a small number of very
large objects in a particular arrangement, and the arrangement is the lesson:
the turbine hall sits between two boilers, the stacks are twice the height of
anything else, and the cooling tower is off on its own because it is the only
part that has to stand in open air. None of that is sayable in glyphs.

The service was the same failure at a hundredth of the scale, and worse,
because a service is almost entirely a set of facts about WHERE things are: a
green box on the verge, a meter at eye height on an outside wall, a panel
round the corner on an inside one, a rod in the dirt by the foundation, a
cable through the joists to a socket in the kitchen. Drawn as icons inside a
ghost rectangle, not one of those facts survived.

## Everything with a size is drawn at that size

`src/render/volumes.ts` holds the primitives — boxes, gables, prisms, rings,
drums, pipes, louvres, insulator stacks — and their solid faces.
`plant-volumes.ts` and `service-volumes.ts` build the two sites out of them at
ordinary dimensions for a 600 MW combined-cycle station and an ordinary
suburban house. The substation yard was already built this way; it now shares
the primitives rather than owning them.

## A wireframe box is transparent by construction

This is the part that took the longest, and all of it was one idea applied
badly three times.

There is no depth buffer. Hidden-line removal happens because every stroke is
drawn over a ground-coloured backing in painter's order, which erases a line
where another line crosses in front of it — and erases nothing in the middle
of a face, because an edge-only box has nothing there. On small yard equipment
that reads as wireframe detail. On a boiler it reads as glass, and a power
station made of glass is harder to read than the flat glyphs it replaced.

So solids declare their faces and `washSegments` fills the ones the camera can
see. Three bugs, each of which looked like something other than what it was:

- **The fill spilled off its own face.** One stroke on each edge of the face,
  all of them the same generous width. Invisible on a boiler twenty metres
  across; on the eighty-millimetre lid of a pad-mounted transformer it erased
  the cabinet underneath, and the transformer read as an open crate.
- **Faces were wound the wrong way.** `quadNormal` takes q1−q0 crossed with
  q3−q0, and the top face of a box was listed in the opposite order — so it
  reported an inward normal and was culled as if the camera were behind it.
  Every flat roof in the power station was open to the sky, and so was every
  prism cap and one of the two slopes of every gabled building. This is not
  visible in a screenshot, because a box with its lid off looks exactly like a
  box until you notice you can see its back edges through the top.
- **The fill sorted per object.** A constant depth offset per item put one
  building's fill in front of another building's edges.

`test/volumes.test.ts` now checks that every face of every primitive points
away from the inside, and that the isometric camera sees exactly three faces
of a box, one of them the top. Winding is not something to keep getting right
by eye.

## The cutaway removes one plane, not three

To show the inside of a house the conventional move is to take the two near
walls off. That is not necessary here and it costs the building its mass: the
camera is thirty-five degrees above the ground, so a wall 2.7 m high hides a
strip about 2.7 m deep behind it and nothing beyond that. Take the ROOF off
and every wall can stay standing with the whole interior in view.

The roof is drawn as a **phantom** — the long dash a drawing office uses for a
part shown in a position it is not in. Drawn solid it read as a wireframe
pyramid hovering over the house and had to be explained; dashed, it explains
itself.

What the camera can see then becomes a constraint on the layout rather than an
accident of it. The meter is on the outside of the wall that faces the reader;
the panel is on the inside of a wall that faces away, far enough in to clear
the wall in front of it; the receptacle is on the far wall of the kitchen. The
coordinates in `SERVICE_NODES` were moved to put each device on the wall it
belongs on, and every straight-line distance is still shorter than the route
length declared for the run that covers it, which is the direction that has to
hold.

## A symbol is what you draw when the thing is too small to read

Over a structure a symbol is a label on something already visible. But one
service spans three orders of magnitude — a pad-mounted transformer is a metre
and a half across and a breaker handle is forty millimetres — so the standard
symbol now appears for exactly as long as it is needed: below about thirty
pixels of built size a device is called out with its symbol on a leader, and
above it the symbol goes.

That gives zooming in the behaviour a reader expects of it. Notation gives way
to the thing.

## Two smaller things that came out of the same look

- **A run is drawn in pieces.** Painter's order sorts a stroke by one depth,
  and a wire that leaves a meter outside a wall and lands on a panel inside it
  is on both sides of that wall at once. Split into pieces about a centimetre
  of screen apart, each sorts on its own, and the service-entrance conductors
  go into the wall and come out inside. The pieces overlap by more than a halo
  is wide, and the dash phase runs on, so a buried run is still one dashed
  line.
- **A pad-mounted transformer serves twelve houses.** The drawing said so in
  prose and showed one wire leaving a green box into empty paper. One
  neighbour in outline and two more laterals running off the page say it
  instead, and they fill the quarter of the site that was blank lawn.

## What is still not right

- **The plant's empty corner**, carried forward from 0018, is still empty
  tarmac — now with buildings around it rather than glyphs.
- **A label's backing plate punches a paper-coloured hole** in the shaded
  floor of the house when it lands there. The backing is what makes type
  readable over the drawing and the shading is what makes the house read as
  enclosed; at the scale the level arrives at it is a minor blemish, and at
  three times device scale it is not.
- **The region scale** and the **20–30 m/px gap** are carried forward from
  0018 and 0019 unchanged.
