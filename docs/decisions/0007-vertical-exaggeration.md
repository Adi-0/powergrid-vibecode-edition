# 0007 — Voltage classes are drawn at different heights, and the exaggeration is declared

**Status:** accepted · **Phase:** 2

## Chosen

At the system and region levels the voltage classes are drawn at different
heights: 500 kV floats above 230 kV, which floats above 115 kV. The hierarchy
is then visible as physical layering rather than asserted in a legend, and
crossings resolve correctly — the higher circuit passes in front of the lower.

**Those heights are not real.** A 500 kV tower is about 50 m tall; at a scale
where the whole state fits on a screen that is three hundredths of a pixel. So
the separation is specified in SCREEN PIXELS and converted to world metres at
the current zoom, which keeps the layers legible at every scale the system view
is used at.

**The exaggeration is stated in the legend, live**, and recalculated as the
camera moves: at the opening view it reads about ×1,200. This is the same
device a geological cross-section uses, and like that drawing, this one says so.

The gaps had to be large — roughly 20 screen pixels between 500 kV and 230 kV.
Anything closer and the hidden-line removal correctly erases a 230 kV circuit
for the whole length of any corridor it shares with a 500 kV one.

## Rejected

- **True heights.** Invisible at system scale; the layering would carry no
  information at all.
- **Flat, all classes on the ground plane.** Honest, and it throws away the one
  device that makes a dense network readable: occlusion.
- **Silent exaggeration.** Rejected on the brief's own terms. A teaching model
  that hides its own edges teaches confident wrongness.

## Consequences

Below the region level the exaggeration retires and true heights are used,
because at substation scale a busbar really is eight metres up and the drawing
can simply say so. The transition between the two is one of the level-boundary
transitions the brief asks for.
