# 0012 — The working, and how it is kept honest

**Status:** adopted, phase 5

## The problem

The brief asks for two things that pull against each other:

> Every calculation in this app must be reproducible by hand. The math panel
> shows the general form of each equation, then the same equation with this
> object's values substituted, then the arithmetic, then the result with units.

and

> Write a test that every math panel's arithmetic is internally consistent.

The obvious way to build a derivation panel is to compute a number in TypeScript
and then write a string describing how it was computed:

```ts
const zBase = (kV * kV) / baseMVA;
panel.add('Z_base = V_base² / S_base', `${kV}² / ${baseMVA} = ${zBase} Ω`);
```

That is two expressions of the same idea, in two languages, maintained by hand.
They drift. Somebody changes the formula and not the string, or changes the
units in one and not the other, and the panel goes on looking authoritative
while telling the reader something that is not true. A derivation panel whose
prose disagrees with its own number is worse than no panel at all, because it
teaches confident wrongness — which is the exact failure mode the whole project
is built to avoid.

And it cannot be tested. A test can check that the number is right; it cannot
check that the sentence beside the number describes the calculation that
produced it, because the sentence is prose.

## The decision

**The substituted line is not a description of the arithmetic. It is the
arithmetic.**

A derivation step holds one string of numbers and operators. That string is
evaluated — by a small parser in `src/math/expr.ts` — to produce the value
printed beneath it. There is no second computation:

```ts
step('Impedance base', 'Z_base = V_base² / S_base',
     `${n(baseKV)}^2 / ${n(baseMVA)}`, 'Ω')
```

`step()` is the only way a step is ever constructed, and it evaluates its own
argument. So the panel physically cannot print a result that its own working
does not produce.

`test/math-panel.test.ts` then takes the same string off the page, evaluates it
with the same parser, and checks it against what the solver independently
computed. **The string a reader sees and the string the test checks are the same
string.** If anybody edits one without the other, there is no other to edit.

### The parser is deliberately tiny

Infix arithmetic, integer and scientific literals, parentheses, and the handful
of functions that turn up in power engineering. No variables, no assignment, no
property access, no way to reach anything outside the expression. It is not a
scripting language and must never become one.

Two details are not incidental:

- **`ln` is natural log and `log` is base ten**, which is the engineering
  convention and the opposite of what most programming languages use. Getting it
  backwards silently changes a line's inductance by a factor of 2.3.
- **`sind`/`cosd` take degrees**, because angles in power engineering are quoted
  in degrees and converting them in the string would put a `π/180` in the middle
  of every expression a reader is trying to follow.

### What the panel will not do

- **It will not round differently from what it evaluates.** Operands are written
  at the precision shown. A derivation carrying fifteen significant figures
  internally and printing four is self-consistent and still a lie: the reader
  does the arithmetic, gets a different answer, and concludes they have
  misunderstood something. The tolerances against the solver are set to what
  that rounding genuinely costs, and no tighter.
- **It will not print a per-unit number without its base.** Every derivation
  that touches per-unit carries S_base, V_base, Z_base and I_base, with a line
  saying what each is for.
- **It will not assume a sign convention.** Each derivation states its reference
  direction in words and draws it. A convention stated in prose is read once and
  forgotten; the same convention with an arrow on it stays checkable while
  somebody is working through the arithmetic underneath.
- **It will not raise a fractional exponent.** `^(1/3)` set as a superscript 1
  followed by a literal `/3)` is not a typographic nicety, it is a different
  number. Roots are written as roots — which is why `cbrt` exists as a function
  of its own.

### Intermediates are exposed, not summarised

A branch derivation runs to sixteen steps: per-unit bases, impedance in ohms,
X/R, the series admittance in rectangular form, the voltage difference, the
series current, the charging current, the total current, P, Q, |S|, power
factor, amperes, loss by I²R, the same loss by conservation, and loading.

That length is the point. The step a reader gets stuck on is never the last one,
and a panel that jumps from "here is the impedance" to "here is the power" has
skipped exactly the part that was hard.

Two of those steps compute the same loss by different routes — I²R and
P_from + P_to — and the panel checks them against each other in front of the
reader. That is not redundancy; it is the demonstration that the thing closes.

## Four things the tests caught

Written up because each was a real defect that a reader would have hit:

1. **The bundle radius formula was wrong.** I wrote a general n-th root form,
   `(n · GMR · A^(n−1))^(1/n)`, which carries a spurious factor of n. There is
   no tidy closed form: two, three and four conductors each have their own
   expression, and the four-conductor one carries an empirical 1.09 because the
   conductors sit on the corners of a square. The check against the model's own
   `bundleRadius` caught it immediately.

2. **Loading was computed at the wrong end.** The derivation used |S| at the
   from end; the solver judges a branch by the end working hardest, because a
   branch is over its limit if either end is. The panel now shows both ends and
   says which one it is judging by.

3. **The geometry derivation was being offered for cables.** A cable's phases
   are concentric rather than hung apart on a crossarm, so D_eq means nothing
   for one and the overhead-line chain would have produced a confident wrong
   answer. It is now restricted to overhead lines.

4. **The tower table was duplicated.** The derivation had its own mapping from
   voltage to tower geometry, which did not match the ids in the network
   builder's `CLASS_CONSTRUCTION`. It now reads that table, so the derivation
   cannot describe a different tower from the one whose geometry produced the
   impedance.
