# Screenshot critique — phase 6, math panels

New views, each with the "Working" toggle on:
- `math-line`: Midway – Vincent 500 kV, π-model flow;
- `math-site`: Moss Landing, a KCL check at each bus;
- `math-region`: the Bay Area balance;
- `math-outlet`: Ohm's law at the wall outlet.

Each view is probed three ways:
- provenance on every digit;
- a panel is present;
- `mathArithmetic`: every substituted line is read back from the page text,
  evaluated, and compared with the printed result at its printed precision.

## Found and fixed

| # | What the screenshot showed | Cause | Fix |
|---|---|---|---|
| 1 | "on a 100 MVA base" in the branch panel's intro failed the provenance probe. | Intro was a plain string. | Intro and title take `{k}` placeholders filled with display-layer numbers (`S_base` from the model data). |
| 2 | "… + −36.2886796 × sin …": a negative earlier result printed after an operator without brackets. | Brackets were decided only for literal numbers. | Any leaf that prints a leading minus is bracketed after an operator, under a square, and after a unary minus. |
| 3 | "2 × 0.018 × 5.21": the reader could not tell which number was km and which Ω/km. | Substitutions printed bare numbers. | Physical inputs print their unit (per-unit and pure numbers go bare; angles inside cos/sin keep the one ° of the function); a squared value with a unit is bracketed. |
| 4 | The region panel had one step, a subtraction of three totals: nothing to check. | Losses were shown by difference only. | Four steps: supply, loss by difference, the same loss summed branch by branch (Σ(P_f + P_t) over every in-service branch inside), and the difference of the two. |
| 5 | Two "Power balance at the bus" panels at Moss Landing, indistinguishable, each with the same paragraph. | Title had no bus; intro repeated per panel. | Titles name the bus voltage (data-file key); an intro that repeats the one above is left out. |
| 6 | "Current drawn by the hair dryer … ÷ 118.076 V" used the outlet voltage the panel goes on to find, without saying so. | Label. | The label says it uses the solved outlet voltage and that the last step comes back to it. |

## Still wrong or weak

- The branch panel is long (nine steps) and needs the inspector to scroll; the P and Q
  steps wrap across three lines. It is readable, but a narrower general form per line
  would help.
- Feeder spans, pole-top transformers and the substation's bus and bank selections
  show their level's panel, not one for the selection itself.
- Reactive power at a bus (ΔQ) is not shown in the bus check; only ΔP.
