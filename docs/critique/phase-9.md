# Screenshot critique — phase 9, honesty, glossary, the guided route

New views: `honesty-feeder`, `glossary`, `tour-stop`, and `tour-run`. The last walks all thirteen stops and checks provenance at each: every stop reached its level, and the slowest took about 10 s, from the service down in the feeder to the plant.

## Found and fixed

| # | What the screenshot showed | Cause | Fix |
|---|---|---|---|
| 1 | The tour card covered the north arrow and the scale bar. | Placed above the day strip. | Top centre, between the key and the inspector column; a notice drops below it while the tour is open. |
| 2 | Opening the glossary at a term shifted the whole page up a few pixels. | `scrollIntoView` scrolls every ancestor. | Scroll the panel's body only. |
| 3 | "V_LL" set as V with a one-letter subscript. | Glossary notations (plain strings) fed to the formula typesetter. | Notations shown as written. |

## Still wrong or weak

- The tour's stop that goes from the service to the plant closes four levels in sequence. It works, and every fold is the lesson played backwards, but it is long.
- The tools bar is three plain buttons; on a phone they sit above the day strip and crowd it.
- The honesty panel lists every section that applies, so it runs long at the System level; it has no index.
