# 0006 — Rendering: constant-width lines and hidden-line removal

**Status:** accepted · **Phase:** 2

## Chosen

**Lines as instanced quads, expanded after projection.** `gl.lineWidth` is
ignored on nearly every platform — the WebGL specification permits an
implementation to support only width 1, and almost all of them do exactly that.
Any drawing that relies on it is a 1-pixel aliased sketch. So each segment is an
instanced quad expanded perpendicular to its *projected* direction in the vertex
shader, which is what makes the width constant in pixels at every zoom.

The fragment shader evaluates a **capsule signed distance** in pixel space. That
gets three things at once: an antialiased edge feathered over one pixel, round
caps that join cleanly at a node, and dash patterns measured along the segment
in pixels so they hold their size as the camera moves. A zero-length segment of
width D draws as an exact disc of diameter D, which is how the ground-coloured
clearings behind site symbols are done — no extra geometry, no second material.

**Hidden-line removal by painter's order, not by depth testing.**

This is the decision that took the longest to get right, and the failed version
is worth recording because the failure was instructive.

The obvious approach is to give every conductor a wider ground-coloured backing
that writes depth, and let the depth buffer decide what is in front. It renders
correctly and produces a useless drawing, for a reason that is specific to this
subject: **transmission circuits run in corridors.** A 500 kV line and a 230 kV
line very often follow the same right-of-way for a hundred kilometres, because
the land was bought once. Depth testing then does its job perfectly and the
upper circuit erases the lower one along its *entire length*.

What a draughtsman does instead is draw from the back forward, breaking each
line only where something in front actually crosses it. So that is what this
does: every mark is sorted by distance from the camera, each halo is interleaved
immediately before its own stroke, and the batch draws instances in that order
with no depth buffer involved at all.

Two bugs were fixed on the way and are worth naming:

- **The attribute must be called `position`.** three.js reads
  `geometry.attributes.position` to decide how many vertices a non-indexed draw
  covers. A geometry whose quad attribute is called anything else draws nothing
  at all, silently.
- **Colour management.** three.js converts every colour into a linear working
  space on the way in. Writing that value straight to an sRGB framebuffer made
  every ground-coloured halo show as a visible pale band against ground of
  exactly the same nominal colour. The fix is `#include <colorspace_fragment>`.

## Rejected

- **`THREE.Line` / `LineSegments`.** One pixel wide, always. Not a drawing.
- **Post-process outline passes.** Would give edge detection, not line weight
  control, and the whole encoding here is line weight.
- **SVG.** Would handle the line work beautifully and fall over at a few
  thousand elements with a live solver behind it.

## Consequences

One draw call for the entire drawing, a few thousand instances, rebuilt only
when the solution or the camera changes. Sorting a few thousand marks per
rebuild costs nothing. The ordering is explicit and debuggable, which the depth
version was not.
