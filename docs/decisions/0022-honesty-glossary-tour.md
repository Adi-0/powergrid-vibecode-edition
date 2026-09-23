# 0022 — Model honesty, the glossary, the guided route, reliability

**Chosen.**
- *Honesty from the document itself.*
  - `docs/simplifications.md` is imported as text at build time (Vite `?raw`), so there is no request at run time.
  - It is parsed into sections and items. The panel shows the sections for the level on the sheet, plus those that apply because of what the reader has done: tripped something, set off a frequency event, faulted the feeder, or opened the working.
  - A test holds the two in step:
    - every section the app asks for exists;
    - every section is reachable from some view;
    - every bullet is parsed (none silently dropped by a formatting slip).
- *A quiet control.* Three plain buttons at the top right (What's simplified, Glossary, Guided tour) on every level. The side panels take the inspector's column, so the key stays in view, and the inspector returns when they close.
- *The glossary is the same data as the hover definitions.* It is searchable by name, notation or definition. Clicking a term anywhere opens its entry. Standards and device numbers (IEEE C37.112, C37.2's 50/51/N) are glossary terms too, which is also how they carry their source through the provenance check.
- *The guided route is thirteen stops.*
  - Each stop is a real place and a real perturbation: noon's duck, a tripped line, a region, the substation, the feeder, the outlet, the plant, the generator, a plant trip, a feeder fault, and the honesty panel.
  - Every stop sets its own scene from wherever the sheet is (`navigate()` closes to the common part of the path and opens the rest), so Back, Next and Resume all work.
  - The reader's place is kept in local storage, when available, for re-entry.
  - The narration carries no bare figures; every number the tour shows is on the sheet, from the model.
  - A harness view walks all thirteen stops and checks provenance at each.
- *Reliability from protection, not from a table.*
  - IEEE 1366's indices (SAIFI, SAIDI, CAIDI, MAIFI_E, ASAI) and the 2.5β major-event threshold, tested against hand-worked records.
  - A seeded twenty-year record of random faults on feeder 1105, each run through the same protection sequence, gives the feeder's indices. The same record, with every lateral fault blowing its fuse, shows what fuse saving trades: fewer sustained outages for more blinks.

**Rejected.**
- *A separate honesty text in the code.* It would drift from the document.
- *A modal tour that takes over the app.* The brief wants it skippable and re-enterable, and every stop left explorable.
