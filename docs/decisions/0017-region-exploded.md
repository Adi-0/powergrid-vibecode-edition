# 0017 — The Region level is an exploded axonometric of voltage layers

**Chosen.** A region is drawn with each voltage network on its own layer above the
map — the lowest voltage just above the ground, 500 kV on top — like the floors of an
architect's exploded drawing, each outlined by a phantom plate (chain line, ink 35 %)
and lettered with its voltage. A substation becomes a dashed vertical axis with a
busbar on each layer it has a bus on; transformers are vertical strokes between two
busbars, banks side by side, each with the two-circle symbol. Generation rises into its
bus up a short riser from its symbol; demand drops from its bus to a load arrow. Lines
to substations outside the region stop at the plate's edge with a tick and the far
substation's name. Chevrons are sized and paced by solved MW on every stroke that
carries power, including risers, drops and transformers.

With nothing selected, the inspector shows the region's balance: generated + arriving
over its edge = taken by customers + lost in the region (by difference), with the
arithmetic printed.

**The transition is the fold.** The level has its own frame (km from the region's
centre). Entering: the camera flies to where the exploded region will fit; at hand-off
the region's drawing is folded flat (group scale y → 0) exactly over the System
sheet's, the System hands over those substations' circuits and symbols, and the layers
rise over 1.5 s while busbars, transformer symbols and plates fade in and the System's
symbols fade out. Leaving is the same fold in reverse. Zooming well out of a region, the
breadcrumb, or Esc all leave; double-click, Enter or the inspector's "Open …" enter.
Reduced motion: the fold is instant.

**Rejected.**
- *Region = the System sheet zoomed in with 115/60 kV shown.* Nothing new is learned;
  the voltage levels and the transformers joining them stay invisible.
- *Layers fanned out sideways* (exploded along east as well as up). Uses a landscape
  screen better, but a substation's buses no longer line up vertically, and the
  "voltage is height" reading is lost.
- *Opaque plates* (hidden-line removal between layers). Legible as a stack of cards, but
  it hides parts of the lower networks and their flows.
- *Risers from the ground.* The first version ran every generator and load down to the
  ground; they made a forest of verticals through the lower layers.
