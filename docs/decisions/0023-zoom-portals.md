# 0023 — One continuous zoom: every node unfolds where it is

Supersedes the navigation of 0017 (Region as a level on the way down) and the level
tree of 0018 (Region → Substation → Feeder → Service opened by buttons and
double-click, each a flight followed by a timed unfold).

**Why.** The author, looking at the built app: zooming in on a node did not reveal what
was under it (the lower levels were reachable only from buttons or the tour), double-
clicking a node raised the Region's voltage layers, which read as a malfunction, and
the levels felt "all over the place". What was asked for: a clear map from above, then
zoom seamlessly into any node to see what is happening there, then deeper into the
machines and facilities. That is a request about the brief's own goal (teach by letting
the reader look), and it overrides the brief's literal tree where the two conflict.

**Chosen.**
- *Portals.* A place in a level that has a level of its own is a portal: where the
  child's seat (a ground point of its frame) lands in the parent's frame, and how many
  parent units one child unit is (1000 from km to m, else 1). Every System node has one.
- *The zoom is the transition.* Past a portal's first zoom (the child would span about
  45 px, or 70 for a part of a level) the child is drawn inside the parent's frame
  through a placement matrix, unfolded by the fraction of the way (in log zoom) to its
  hand-off zoom (where it fills 60 % of its fitted view; 85 % for a part). The wheel,
  a pinch, `+`/`−` scrub the unfold both ways; nothing is timed. Up to six children
  unfold at once — the ones nearest where the reader is zooming — so panning never pops.
  Zooming in near a node draws the zoom's focus onto it, so it stays put while it opens.
- *Hand-off.* At the hand-off zoom the sheet and the camera go to the child's own frame
  (target and zoom converted exactly; nothing moves on screen). Zooming back out past
  94 % of it hands the sheet back, and the child is again a band of the parent,
  folding as the zoom goes on. The levels above stay drawn around the one on the sheet,
  through composed inverse placements: the parent at half ink, further up a third —
  except the System around a station, whose circuits are the station's own, carried
  on. The sheet's own level recedes the same way as a child unfolds in it, so nothing
  jumps at the hand-off. Each frame keeps its own precision (the camera's depth range
  follows the zoom).
- *Footprints give way.* What the parent draws in the child's place yields as the child
  unfolds: a System node's symbol fades; the System's circuits into a station end
  where the station's own stroke takes them up, following that stroke as it unfolds
  (their far ends never move). What both levels draw in the same place — a plant's
  boilers and stacks, a substation's fence and gantry, a street's homes and drops — is
  drawn by the child never folding, and the parent hides its copy.
- *Every node has an inside.* A new Site level draws any station from the network data
  (see `docs/simplifications.md`, "site"): a bus per voltage, a bay per circuit with its
  breaker, disconnect and gantry, one tower per corridor outside the fence, the circuit
  on at conductor height on its true bearing to the point where the System's stroke
  takes it; banks between the buses; plants, demand, capacitors and DC converters in
  bays of their own; chevrons at the System's own MW scale, so a circuit's chevrons
  keep their size across the hand-off.
- *The tree follows space.* System → station (every node); Moss Landing's station →
  Unit 1 → each generator; Evergreen's node → its neighbourhood (feeder 1105 with the
  substation at its head) → the substation's yard, or any pole-top transformer's
  service. Zooming in always reveals something smaller that is inside what was on the
  sheet.
- *One orientation.* Every level shares the System frame's axes (north up the sheet);
  equipment drawings are laid square to the frame, so their site grids run 45° off true
  north, which the north arrow shows. A child never turns on its way in.
- *Moves that are not the wheel are the same zoom.* Double-click, Enter on a selection
  and the inspector's "Zoom inside" fly the camera into the node (held steady on the
  sheet, eased so the band takes most of the time), through the hand-off, and settle it
  on the child fitted — with the child's own children folded. Esc and the breadcrumbs
  fly back out the same way. The guided route and the screenshot harness use the same
  moves.
- *The Region's layers are a lens, not a level.* "See the region in layers" in a place's
  inspector; double-click never opens it.

**Rejected.**
- *Keep the button-and-fly transitions, add wheel-triggered opening.* A threshold that
  starts a timed animation is still a jump the reader did not make; the unfold must be
  the zoom itself to be reversible mid-way.
- *Turn the view 45° between map and equipment levels.* Considered while the feeder was
  drawn north-up: a rotating sheet disorients more than an honest north arrow does.
- *A pad face to hide the parent's lines inside a yard.* Depth-fights the yard's own
  ground strokes at every zoom; moving the circuits' ends is exact.
- *Only Evergreen and Moss Landing openable.* "Any node" was the request; the Site
  level makes every node honest about what it is from the data, and says (in the
  honesty panel) that the layout is a rule, not a survey.
