# 0015 — Hidden-line precision: stencilled surfaces, per-fragment line depth

**Problem.** At Bay Area zoom (5 px per km), long 500 kV conductors vanished over
part of their length while their flow chevrons carried on. Hiding the slab faces
brought them back; raising polygon offset to factor 6 also did, but a
slope-scaled offset that large lets far walls and the neighbours' outlines bleed
through at state zoom.

**Cause.** Two kinds of sliver. Ear-clipping California's coastline gives triangles
hundreds of kilometres long and a fraction of a kilometre wide; a line's quad is a
sliver too (two thousand pixels by five). A rasteriser derives each triangle's depth
plane from its three snapped vertices, and for a sliver that plane can tilt enough
to put the surface in front of the line drawn on it, by more than any sensible
polygon offset.

**Chosen.**
1. *Flat regions* (California's surface, the neighbours') are drawn in two passes
   (`src/render/region.ts`): a stencil-only pass that inverts one bit per triangle of
   a fan from each ring's first vertex (even–odd coverage: no triangulation, holes
   and islands for free), then one rectangle over the bounding box — two well-shaped
   triangles with an exact depth plane — drawn where the bit is set, clearing it.
2. *Lines and chevrons* compute their position along the segment and their depth
   in the fragment shader from `gl_FragCoord` and the segment's projected endpoints
   (flat varyings), and write `gl_FragDepth`. Dash phase and chevron placement
   become exact as a side effect.
Polygon offset stays at factor 1, units 2, for the faces that remain (walls,
equipment boxes).

**Rejected.** A larger polygon offset (see above). A constrained Delaunay
triangulation: fewer slivers but not none along a coastline, and more code than the
stencil. A depth bias on lines in world units: at close zoom it lets hatching behind
the slab's far edge show through.

**Cost.** Writing `gl_FragDepth` turns off early depth rejection for line fragments;
lines cover a small fraction of the screen. The stencil fan overdraws, but a
colour-less stencil pass is the cheapest fill a GPU does. The renderer is created
with a stencil buffer.
