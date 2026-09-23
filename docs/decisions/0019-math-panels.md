# 0019 — Math panels: arithmetic as data, checked twice

**Chosen.**
- *A panel is data, not markup.* A panel (`src/math/expr.ts`) is a list of steps. Each
  step has what it finds (in words), a general form in standard notation, an
  expression tree over numbers, and a unit. Every number in the tree carries a
  provenance key: solver output, data-file entry, or an earlier step. The page
  (`src/ui/mathview.ts`) prints the tree with those numbers as display-layer spans.
- *Displayed values drive the arithmetic.* Each number is rounded to the digits it is
  shown with. The step's result is computed from those rounded numbers, the way a
  reader with a calculator would, and is then rounded as shown. Later steps use
  earlier results as shown. The solver's own unrounded value is quoted beside the
  result, so a reader can see the working and the solve agree. When a step is an
  approximation (a series voltage drop, say), it says so and states its tolerance.
- *Precision chosen so the two agree.* Inputs carry enough digits for the displayed
  arithmetic to land within two units of the displayed result's last place:
  - branch-flow inputs: V to 7 decimals, θ to 6, R/X/B to 8 significant figures;
  - bus terms: 4 decimals.
- *Two checks.*
  - `test/math-consistency.test.ts` builds every branch, bus and region panel at two
    times of day, plus the substation, feeder, meter and outlet panels on a coupled
    solve. It checks each step's displayed result against the solver.
  - The screenshot harness (`mathArithmetic`) reads each substituted line back from
    the rendered page as printed text: thin spaces, minus signs, ×, ÷, √, cos (…°),
    superscripts. It evaluates that text and compares it with the printed result. So
    what reaches the screen, not just the data behind it, reproduces.
- *Where the working lives.* A "Working" toggle in the inspector header (key W) swaps
  the readout for the working behind it and stays on across selections. The toggle
  appears only when the selection has working to show.
- *Newton–Raphson is not closed form.* The bus panel is a check, not a derivation: it
  plugs the solved voltages back into Kirchhoff's current law and shows that the
  mismatch is about zero. The region panel counts losses two ways and shows they agree:
  - by difference: P_G + P_in − P_D;
  - branch by branch: Σ(P_f + P_t).

**Rejected.**
- *Formatted strings with numbers pasted in.* The test would have had to scrape its own
  output, and a rounding change could silently break the arithmetic.
- *Showing the solver's values unrounded in the substitution.* The printed digits would
  then be too many to copy down, and the result would not follow from what is shown.
- *A separate math level in the zoom tree.* The brief says math is a panel bound to the
  selection.

**Coverage and limits.** The panels built so far are:
- System and Region: circuit and transformer (π-model flow), place (a KCL check per
  bus), and the region's balance;
- Substation: the bank's losses;
- Feeder: the feeder's balance, and a home's meter;
- Service: Ohm's law at the outlet.

Selections below the region without a panel of their own (a single feeder span, a
pole-top transformer) show their level's panel for now.
