# 0009 — Three days, not one, and why the spring day exists

**Status:** accepted · **Phase:** 3

## Chosen

Three days the user can switch between: **summer**, **winter** and **spring**,
each with its own demand shape, its own solar shape, and — the part that was
missing at first — its own **peak scale**.

The demand shape is normalised to its own maximum. Without a seasonal scale on
top, every day of the year would peak at the same megawatts, which is the
opposite of true: the annual peak happens on a hot summer evening and a spring
day never comes close. Summer is 1.0, winter 0.86, spring 0.72.

## Why the spring day matters

With only a summer and a winter day, the marginal price moved between $43 and
$46 across the whole 24 hours. The duck curve was there — net load dipped to
15.4 GW at eleven and climbed 13.3 GW by seven — but the *price* never moved,
because net load never fell far enough for anything cheaper than gas to be on
the margin. A demonstration of merit order in which the merit order never
changes is not a demonstration.

Spring is when the duck is actually deepest, and it is not a coincidence: mild
weather means the lowest demand of the year, while the days are already long
and the panels are cool and therefore efficient. Renewable output at its best
against demand at its worst.

With the spring day the model now produces, unprompted:

| | Summer 18:00 | Spring 11:00 |
|---|---|---|
| Demand | 33.9 GW | 17.8 GW |
| Net load | 27.0 GW | 1.5 GW |
| Marginal unit | Mira Loma combined cycle | Pacific Northwest intertie |
| Price | $45/MWh | $22/MWh |
| Northwest import | 4.85 GW in | 0.94 GW in |

Two further changes were needed to get there, both of which are simply more
accurate:

- **Import ties can run backwards.** When California is long, power flows out of
  the state rather than in. An oversupplied system exports before it curtails,
  and the model now does too.
- **More solar.** 16.3 GW installed rather than 12.7 GW, which is where the real
  fleet already is.

## Consequences

The price range is now roughly $14–$46 across the three days, the marginal unit
changes from an intertie to a gas plant and back, and curtailment appears where
oversupply genuinely bites. None of it is scripted: it is what the merit order
returns when it is run against the three shapes.
