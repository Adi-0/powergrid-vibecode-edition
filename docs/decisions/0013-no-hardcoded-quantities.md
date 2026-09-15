# 0013 — Proving that no displayed number is typed in

**Status:** adopted, phase 5

## The requirement

> Write a test that fails if any displayed quantity is a hardcoded constant
> rather than traceable to solver output. The integrity of the project rests on
> this.

It does. Everything this app claims rests on the numbers being real, and there
is no way for a reader to tell a live number from a plausible-looking constant
by looking at it. That is precisely why it has to be mechanical.

## Why the obvious approaches do not work

**Grepping the source for numeric literals** produces hundreds of legitimate
hits — symbol sizes, dash patterns, tower spacings, conductor tables — and no
way to separate them from a hardcoded readout. It would be noise with a test
runner attached.

**Asserting that specific labels equal specific solver fields** only covers the
labels somebody remembered to list, which is the same failure as not having the
test.

## The decision

**Solve the system several times, collect every string the drawing puts on
screen, and require every number that does not move to be explicitly accounted
for.**

This is possible because every scene returns its labels as data — `LabelSpec[]`
with `text` and `value` — before any of it reaches a canvas. A test in Node can
therefore collect literally every string the interface displays, with no browser
and no rendering.

The argument is then airtight by construction. Any displayed value containing a
digit that is identical across every state of the system is one of exactly two
things: a genuine constant, or a number somebody typed in. There is no third
possibility.

So `test/no-hardcoded-quantities.test.ts` carries a **register of the genuine
constants**, each with the reason it is allowed to be constant — nameplates,
instrument transformer ratios, ANSI device numbers, conductor sizes, the
dimensions of the yard. Anything that does not match the register fails.

That register is the real artifact here. It is not a list of exceptions to get
the suite green; it is the complete, reviewable statement of every fixed number
the interface shows. Adding to it is a deliberate act with a written reason
attached, which is exactly the friction that keeps a hardcoded quantity from
ever slipping in quietly.

## The baseload problem, and the fifth state

Four states — summer 04:00, summer 18:00, winter 12:00, spring 11:00 — move
almost everything. They do not move Diablo Canyon or The Geysers, because
baseload plant does not follow load: nuclear and geothermal run flat out at four
in the morning and at six in the evening and in every season. Their output is
genuinely constant, and a differential test cannot tell "a solver output that
happens to be constant" apart from "a number somebody typed in".

The tempting fix is to exempt them. That is the wrong fix, because the exemption
would then also cover a genuinely hardcoded site readout.

The right fix is to give them a reason to move. A fifth state derates every unit
whose output never varied to sixty per cent — a stretched refuelling run, a
partial outage, an ordinary operating condition. The labels then have to follow,
and if one does not, it was never reading the dispatch at all.

Which units get derated is worked out from the first four states rather than
named in the test, so it keeps working if the fleet changes.

## Proving the test is not vacuous

A test that passes because it checks nothing is worse than no test. So the guard
was verified by breaking the thing it guards: one feeder label was changed from
the solved bus voltage to the constant `1.0250 pu`. The test failed immediately
and named all seven affected labels. Restoring the line made it pass again.

## What it covers, and what it does not

**Covered:** every label in the system view, the feeder view, both
representations of the substation view, and the service view; every derivation
the math panel can show for six representative selections.

**Not covered:** the inspector and the side panels, which build HTML directly
and would need a DOM to test. Their numbers all come from the same `SolvedCase`
through the same snapshot, and `AppState` re-derives that snapshot on every
change, so there is no place for a stale value to live — but that is an argument
rather than a proof, and it is recorded here as such.
