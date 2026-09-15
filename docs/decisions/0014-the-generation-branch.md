# 0014 — The plant, the machine, and three things the drawings caught

**Status:** adopted, phase 6

## The second branch

The brief's zoom tree has two branches. The first runs system → region →
substation → feeder → service and ends at a socket. The second runs plant →
machine and ends at a rotor. They meet at the system view, because that is where
the power actually goes: out of a machine, through a plant, into the network.

So the breadcrumb sets them apart rather than running them together. A single
chain reading "…Service › Plant" would draw a line that does not exist.

**Which branch the reader is on cannot be worked out from scale.** The Eden Vale
yard and the Metcalf plant site are legible at overlapping scales and are three
hundred kilometres apart. The compositor already culls a scene whose bounds the
camera cannot see, so the honest answer to "what is the reader looking at" is
the compositor's own account of what it just drew — which is why `composeFrame`
returns its active scenes and the panels read that rather than the zoom level.

That had a consequence worth writing down: a panel that depends on **what was
drawn** cannot be updated from a camera event, because at the moment a fly-to
finishes the frame for the new position has not been built yet. The viewport now
calls back after each rebuild, and the contextual panels hang off that.

## Thermal streams are ducts, not strokes

Everywhere else in this app the line weight of a conductor carries its voltage
class, and the rule is absolute. At the plant most of what moves is not
electricity: it is fuel, hot gas, steam and cooling water, and the interesting
thing about each stream is how much energy is in it.

So thermal streams are drawn as **ducts** — two parallel walls with the gap
between them proportional to the square root of the power, so the area on the
page tracks the energy — and electrical streams stay single strokes at their
voltage class weight.

This is not a dodge. A duct carrying twice the gas really is bigger; plant
drawings really do show ducts as ducts; and the square root is how a duct
actually scales, because a pipe carrying four times the flow at the same
velocity has twice the diameter. The result is that the shape of the energy
chain is legible without reading a number: the exhaust duct out of a gas turbine
is enormous, the stack is narrow, and the pipe to the cooling tower is wider
than everything electrical on the site put together. That last one is the fact
worth carrying away, and it is visible before any label is read.

## The energy chain closes by construction

The plant's efficiency comes from its heat rate, which is already in the network
model because it is what sets the plant's marginal cost. Every split below it is
expressed as a fraction of fuel energy, and **the condenser stream is computed
as the remainder**, so what goes in equals what comes out to the last decimal
rather than approximately. The test asserts the residual is under a billionth of
the fuel stream — about two watts at full load.

That matters because the chain is the thing a reader is invited to follow from a
gas pipe to a transmission line. If the streams did not add up it would teach
the opposite of what it is for.

## Three defects the drawings caught

**The plant was switched off.** A purely economic merit order left the only
large plant inside the Bay Area at zero on a summer evening, because at
$46/MWh it is the most expensive combined cycle in the fleet. No operator would
do that: the cheap generation that would replace it is two hundred kilometres
away behind a corridor that is already full. Real dispatch is
security-constrained, and plants in that position are contracted as
**reliability must-run**. That is now a flag on the generator, honoured by the
dispatch — and the ordering matters as much as the flag. Committed at the *end*
of the merit order, an expensive must-run unit is reached with almost nothing
left to serve, overshoots by its whole minimum, and forces renewables to be
curtailed at the evening peak. It is committed first, and the economic stack
fills in around it.

**The system threw away free energy before it turned anything down.** When the
stack overshot, the surplus fell straight onto the zero-cost resources. An
operator's first move is the opposite: back down whatever is burning fuel, most
expensive first, as far as each unit's own minimum allows. Only what cannot be
absorbed that way is genuine minimum-generation curtailment. With that order
corrected, this fleet turns out to absorb its entire spring surplus — three
gigawatts of batteries charging, a gigawatt of pumped hydro, and exports on the
Northwest tie — which is a more interesting result than the one it replaced, and
is why the system-level control is "take the batteries out of service".

**The sunniest hour of the year was priced at the most expensive unit in the
fleet.** "No unit was marginal" was being read as scarcity. It happens for two
opposite reasons: the stack ran out before demand was met, or the stack was
never needed because the must-take resources alone exceeded demand. One means
the price is at the cap and the other means it is at the floor. Without storage,
spring midday now prices at zero and the evening at $42 — which is precisely
what a battery fleet is paid to flatten.

## A stale setpoint that looked entirely plausible

The machine panel showed a 300 MW generator producing exactly zero reactive
power, at a power factor of 1.000. It was reading `generator.qMVAr`.

Real power is a setpoint: the dispatch decides it and the solver honours it, so
it lives on the generator record. **Reactive power is not.** At a PV bus the
machine's job is to hold the voltage, and how many megavars that takes is
something the solver *discovers* — so it appears in the bus result and is never
written back. Reading the generator record gives a stale setpoint, usually zero,
and zero MVAr is a number a reader has no way to disbelieve.

The real figure is 439 MVAr at a power factor of 0.564, which is a great deal of
reactive support from one machine — and is exactly why that machine is must-run
in the first place. The two defects were the same fact seen from two directions.

`test/no-hardcoded-quantities.test.ts` did not catch this because the machine
panel builds HTML rather than returning label data. The scene labels it does
cover were fixed at the same time and are now checked.

## What the capability curve gets right, and one sign it had wrong

The field limit is a circle centred at −V²/X_d with radius V·E_max/X_d, drawn
through the machine's rated point. The first version rebuilt that rated point at
whatever terminal voltage was asked for, which made a *sagging* terminal voltage
appear to increase the machine's reactive capability.

It does the opposite, and the difference is the mechanism of voltage collapse:
E_max is a property of the field winding and does not change when the system
voltage falls, so the centre rises towards zero as V² while the radius shrinks
only as V, and the top of the circle comes down. A generator asked to hold up a
sagging system can do less about it, not more, exactly when more is needed.

The machine's rated power factor is now read out of the case — a 1,000 MW
machine on an 1,111 MVA base is rated at 0.9 — rather than assumed to be the
textbook 0.85, so the curve and the dispatch cannot disagree about what the
machine is.
