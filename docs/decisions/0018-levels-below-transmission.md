# 0018 — Substation, feeder and service: frames, plans and the unfold

**Chosen.**
- *A level stack.* The app keeps the open levels (System first). Every level has its
  own frame: kilometres for System and Region, metres below. A level opens out of a
  node of the one above: the camera flies toward the node, hands off to the child's
  frame with the child's origin exactly where the node was on screen, and the child
  unfolds out of that point (every stroke, face and symbol carries a collapse anchor
  and a stagger) while the camera settles on it; the camera leads, covering most of
  the zoom early, so what unfolds is always large enough to follow. Closing folds it
  back into the node. Region → Substation unfolds Evergreen's 60 kV busbar into the
  yard (1000 region units per substation unit); Substation → Feeder grows feeder 1105
  out of its exit at the fence, outward in order of distance along the feeder;
  Feeder → Service unfolds a pole-top transformer into its secondary, drops and homes.
- *Plans.* Maps (System, Region, Feeder) are turned so north is up. Equipment drawings
  (Substation, Service) keep the plan square to the frame, so the isometric camera sees
  every box at 45° with two sides and a top — the axonometric-section look the brief
  asks for. Each level states its north for the north arrow, and the scale bar says
  which foreshortening applies.
- *Coupled solves only where they are seen.* The worker solves the Evergreen substation
  and feeder coupled to the transmission system (3–4 passes, 50–150 ms) only while a
  level that draws them is open; the System and Region stay on the fast
  transmission-only solve.
- *Chevron scale per level* (MW per px at the System, MW at the Substation, kW on the
  feeder and at the service), stated in the key.

**Rejected.**
- *Spatial nesting* (feeder map as the parent of the substation, since it is larger):
  it contradicts the brief's tree (Substation → Feeder → Service), which follows the
  power. Each level is its own drawing at its own scale; the transition shows the node
  opening, not a physical zoom.
- *Everything north-up.* At equipment scale, boxes seen square-on show only a front and
  a top; the drawing stops reading as three-dimensional.
- *Coupled solve always.* 3–4× the cost on every scrub for views that do not show it.

**Sweep speed.** The distribution solver now stores each element as four 3×3 complex
matrices on typed arrays (every element is linear in V and I); identical results to 9
digits, 127 → 31 ms per feeder solve.
