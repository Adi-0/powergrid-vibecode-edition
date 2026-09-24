# 0024 — Yards drawn in three phases, from an equipment kit

**Why.** The author's review of 0023: zoomed in, "some lines don't really connect or
make a lot of sense". A conductor jumped from the bus to a breaker box and up to a
gantry, past disconnect posts it never touched; gantries were bare strokes; the load's
lines ended in the air; a hydro plant's penstocks ran back through the yard. The ask was
more detail where one zooms in — "show more so we don't need to barrage the user with
words".

**Chosen.**
- *An equipment kit* (`src/levels/kit.ts`). Each part is drawn as a solid with its
  terminals, and every conductor is run from terminal to terminal:
  - post insulators with their sheds;
  - three-phase disconnect switches, with the blade between two insulators on a steel beam;
  - dead-tank breakers, with bushings rising in a V from the tank;
  - dead-end gantries, with insulator strings;
  - lattice towers, with bracing, crossarm and strings;
  - transformers, with radiators, conservator, and high- and low-voltage bushings.

  Sizes follow the voltage class (typical clearances; drawing estimates, not a design).
- *Three phases inside a yard.* The bus is three tubes. Each bay carries three
  conductors through its equipment. Outside the fence, a circuit's three conductors
  converge on the point where the System's single stroke takes it up. That makes the
  one-line convention itself visible, and the key says so.
- *Corridor towers stand straight out from their gantries, past the fence.* The long
  span to the exit then runs outside the yard.
- *Plants stand beside their bay.* Each is reached over a span from the bay's gantry to
  its step-up transformer at the plant's edge. Each kind is drawn by what makes it
  recognisable, facing the yard:
  - a gas plant's hall, boiler and round stack;
  - a reactor's domed containments;
  - a hydro powerhouse at the foot of penstocks climbing away to the intake;
  - wind turbines with their collector cables;
  - solar tables on legs, with inverter skids;
  - battery containers with inverters.
- *The demand bay* steps down through a bank and leaves on wood H-frames at 60 kV.
  *Capacitor banks* are racks of cans on insulators.
- *Evergreen's substation* uses the same kit: three 60 kV bays, a three-tube bus, and
  the bank with radiators and conservator. The neighbourhood's one-line stand-in for the
  60 kV side gives way to it as the yard unfolds.
- *Homes* are drawn once (`src/levels/home.ts`) and used by both the Feeder and Service
  levels, so one sits exactly on the other: pitched roof, door to the street, windows,
  the meter under the eave where the drop lands, and panels on the roof slope. The
  pole-top transformer is a round can with its bushing. Feeder poles carry a crossarm
  (three phases) or a bracket (one).

**Rejected.**
- *Three phases everywhere, the map included.* At state scale three strokes per
  circuit are noise; the one-line drawing is how the field reads a network.
- *More text labels for each part.* The key names each piece of equipment with a small
  drawing of it, and the glossary explains it on hover. Parts are labelled on the sheet
  only at close zoom.
