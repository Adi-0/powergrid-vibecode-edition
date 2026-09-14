# 0011 — Where the solver stops, and what happens after it

**Status:** adopted, phase 4

## The problem

The brief requires the zoom tree to terminate at the wall outlet, and requires
every calculation to be reproducible by hand. Those two requirements pull in
opposite directions at the very bottom of the system.

The power flow is a **balanced positive-sequence** solver. That is the right
model for a transmission network and an acceptable one for a distribution
feeder, where a single-phase lateral can be carried as a three-phase circuit
with a third of the load (simplification `distribution-untransposed`). It is not
a defensible model for a house. A 240/120 V service is genuinely single-phase:
one secondary winding with its mid-point earthed, two hot legs 180° apart, and a
neutral that carries only the *imbalance* between them. Pushing that through a
balanced solver would produce numbers that look authoritative and mean nothing.

## The decision

**The power flow solves down to the secondary terminals of the pad-mounted
transformer and stops. Everything past that point is worked in the open.**

`SVC_LV` is a real bus in the real case — the same case that solves the Oregon
intertie — and its voltage comes out of the same Newton–Raphson iteration as
every other bus. Conservation closes across the whole chain, from a turbine at
Diablo Canyon to twelve houses on Cherry Lane, because there is one solve and
not two.

From those terminals to the socket, `src/data/california/service.ts` applies the
form every electrician and every voltage-drop table uses:

    ΔV = I · (R·cos φ + X·sin φ)

with R and X taken over the whole **loop** — out on one conductor and back on
another, so the length counts twice. Conductor resistance and reactance come
from NEC Chapter 9 Table 9 and ampacities from Table 310.16, cited per
conductor, in ohms per thousand feet because that is the unit the source table
uses and the unit the person sizing the wire works in. The metric conversion is
derived in the code rather than substituted, so the number can be checked
against the book.

The approximation in that formula is worth naming and the code names it: it
keeps the component of the impedance drop lying *along* the supply voltage and
drops the component at right angles to it, which moves the angle but moves the
magnitude by less than a hundredth of a volt at these currents and lengths.

The inspector shows the whole chain — general form, the current, the loop
resistance, each drop, the running voltage — so the claim "reproducible by hand"
is not a promise, it is the panel.

This is in the model-honesty register as `service-drop-by-hand`, with what it
costs: the imbalance between the two legs, and therefore the neutral current,
which is the thing the three-wire arrangement exists to manage.

## Perturbation at the bottom of the tree

The brief asks for perturbation at every level with a real re-solve. At this
level the perturbation is a kettle.

Switching on an appliance adds a real load to `SVC_LOAD` in the real case and
re-solves the whole state. It is not scaled, faked or short-circuited. Switching
on the 11.5 kW car charger at 18:00 on a summer day produces:

| | off | on |
|---|---|---|
| System demand | 33,925.9780 MW | 33,925.9895 MW |
| System losses | 901.7323 MW | 901.7350 MW |
| Total generation | 34,827.7103 MW | 34,827.7245 MW |
| Transformer secondary | 243.97 V | 243.20 V |
| Voltage at the socket | 121.90 V | 121.20 V |
| Current in the service | 13.2 A | 61.0 A |

Demand rises by 11.5 kW exactly. Losses rise by 2.7 kW, because that 11.5 kW has
to be carried four hundred kilometres. Generation rises by 14.2 kW, which is the
load plus the extra losses, and it comes out of the marginal unit because that is
what a marginal unit is. The 50 kVA transformer goes over its nameplate and says
so in the one colour the app uses for that.

One car charger, in one house, moving the number in the header. That is the
whole argument of the project in six rows.

### The share, and why it is taken out first

Twelve houses share the transformer, and this house's ordinary draw is a twelfth
of the solved load at its secondary. But an appliance the reader switches on is
in *this* house and in no other, so it is removed from the shared figure before
dividing and added back afterwards. The first implementation divided everything
by twelve, and an eleven-kilowatt car charger appeared to draw four amperes.

The difference between a house's own peak and its share of the coincident peak
is exactly what a coincidence factor measures, and the inspector says so at every
pole.
