# 0016 — Breadth, and the one thing in the app that is a route

**Status:** adopted, phase 8

Phase 8 is the brief's last: "breadth + guided path". Everything in it is an
object the brief names explicitly and that the first seven phases did not build.
Five decisions were made along the way that are worth writing down, because in
each case there was a cheaper option that would have looked the same and taught
something false.

## 1. The convergence plot shows two solves, not one

The solver panel exists because the brief asks for Newton–Raphson iterating
visibly. The first version showed the solve that produced what is on screen —
and that solve is WARM STARTED from the previous second's answer, so its first
mismatch is already at 10⁻¹² and the plot is a flat line with a jump in it.
Honest, and useless as a picture of the method.

The fix was not to plot something else. It was to plot the same case a SECOND
time, solved cold from a DC-power-flow estimate, and draw both. The cold curve
is the one that shows Newton working; the warm one is the one that shows why a
control room re-solves rather than solving. The panel then states the difference
between the two answers — a few parts in 10¹³ — because "where you begin decides
how long it takes, never where you arrive" is a claim, and a claim is worth less
than a number.

**Rejected:** plotting only the cold solve. It would have been a clearer picture
of an event that is not what actually happened.

The plot is also BROKEN wherever a bus changed type on a reactive limit, with a
rule marked "problem changed". Joining those two halves with a line would claim
a continuity that does not exist: either side is convergence on a different set
of equations. The convergence-order column goes to "—" across the same break,
for the same reason.

## 2. The reliability indices are computed from topology, not quoted

SAIFI, SAIDI and CAIDI are quoted everywhere and explained almost nowhere, and
the reason to put them in front of somebody is that they are not weather. They
are the arithmetic consequence of three choices, and all three are switches in
the panel: a recloser part-way down the feeder, fuse saving, and a tie to the
next feeder.

The sum factorises by PROTECTIVE DEVICE rather than by section, which is not how
the textbook writes it but is how the system works: every section a device
protects drops exactly the same customers, so ΣCI = Σ_devices (λ_zone · N_zone)
and each term says what one device is worth.

Two things fell out of building it that were not planned:

- **The lateral fuses are derived from the feeder data, not listed.** A fuse
  belongs wherever a single-phase circuit taps off the three-phase main, so
  adding a street to the feeder gives it a fuse without anybody editing a list.
- **The substation is in the sum.** A 12.47 kV bus fault is the single largest
  contributor to SAIDI on this feeder despite happening once a century, because
  a rate times a consequence is not a rate. Meanwhile a fault on one of the two
  115 kV lines contributes exactly zero, which is what the second line is for —
  and that zero is worth showing.

**Rejected:** quoting a national-average SAIFI. It would have been a larger,
more familiar number and would have taught nothing about where it comes from.

## 3. Fuse saving is presented as a trade, not an improvement

Every switch in the reliability panel makes something worse, and the panel says
so with the number: turning fuse saving off improves MAIFI and worsens SAIFI,
and the two deltas sit side by side with only the worsening one in the alarm
colour. Reliability engineering is not a search for the option with no downside.
It is a decision about which customers wait and for how long.

## 4. Motor starting is two solves with the slow controls held

The brief asks for induction motor starting. The obvious implementation adds the
locked-rotor demand to the case and re-solves, and the first version of that
produced a dip four times too large. The cause was instructive enough to keep a
note of: `operate()` re-runs the capacitor switching and re-seats the tap
changers from their defaults, so the "during" case was being compared against a
feeder with different reactive support, not against itself a second earlier.

The fixed version holds the capacitor banks and passes the SETTLED tap changers
into the second solve. That is not a convenience — it is the physics. A start
lasts a few seconds; a tap changer takes tens of seconds per step by design,
precisely so that it does not chase transients. Once the motor is RUNNING both
controls do respond, and the app shows that too: the dip that made the lights
flicker is regulated away within a minute and the only trace left is a tap
position.

The discrepancy was found because the panel prints the textbook estimate —
starting kVA over short-circuit kVA — next to the solved answer. With the bug
they differed by a factor of four; without it they agree to two decimal places
in every case and at both locations. **An approximation whose error is never
shown is a superstition; one whose error is shown is a tool.** That is the
argument for printing both, and it paid for itself immediately.

The motor can be started in two places, because the lesson is not the motor. It
is the STIFFNESS of the bus: 241 MVA at the industrial unit gives a 0.50 % dip,
96 MVA at the far end of the feeder gives 1.22 %, from the same nameplate. One
number — short-circuit capacity — answers both "how much current would a fault
here draw" and "how far will the voltage fall when a motor starts", because they
are the same divider.

## 5. Ferranti energises a second circuit rather than opening the one in service

The first implementation re-pointed the line at an isolated bus, which is the
literal reading of "open the far end". On a 500 kV intertie that removes a major
transmission path, and the study came back with the sending end at 0.88 pu and
the solve not converging: a real result about a different question.

The version kept energises a PARALLEL circuit of the same construction from the
sending bus with its far breaker open, leaving the existing circuit in service.
That is what actually happens in a control room when a line is switched in, and
it leaves the rest of the network undisturbed so the sending-end voltage is
whatever the system genuinely holds it at.

Three answers are shown: the nominal π model the solver is built on, the exact
distributed-parameter result, and the solve. On 230 km they agree to four
figures. On 496 km the π model says +24.65 % and the distributed answer says
+23.66 %, and that one-point gap is exactly where a real study stops using a
lumped model. Making the modelling assumption visible is worth more than hiding
it behind an answer that is right to three figures.

## 6. The guided path drives the public controls

Fourteen steps, each of which DOES something and then says one short thing about
what just happened. The rule enforced while writing them: a step whose text
could be deleted without loss has earned its place; a step whose ACTION could be
deleted has not.

Two structural decisions:

- **Every step sets the whole state it needs**, not a difference from the step
  before, because the dots along the bottom let a reader jump to any step. A
  step that assumed it was arrived at in order would show its text against
  somebody else's picture. (This was caught by a screenshot, not by a test.)
- **It drives the same controls a reader would use by hand.** There is no
  private back door into the state, so anything the path does can be undone by
  touching the control it touched, and leaving the path leaves the app exactly
  where the path got to rather than resetting it.

Controls that the path moves now follow the state rather than holding their own
copy of it — the season buttons, the fault buttons, the motor buttons — because
a control showing the wrong thing is worse than no control at all.

## What this phase did not build

The brief's breadth list is complete except in one respect worth naming: the
remaining GENERATION TYPES and REGIONS were already in the case from phase 2 and
did not need new work — nuclear, geothermal, hydro, pumped storage, combined
cycle, combustion turbine, wind, solar, batteries and three import ties all
dispatch and all appear in the capacity-factor table. What phase 8 added there
was a way to SEE the difference between them: a capacity factor of 1.000 against
0.000 says what a baseload machine and a peaking machine are for more compactly
than any label.
