# 0003 — Data files are typed TypeScript modules

**Chosen.** Network, equipment and machine parameters live in `src/data/*.ts` as
plain object literals with an explicit type, one record per asset, each carrying a
`src` key into the source registry (`src/data/sources.ts`), and comments where a
value needs a sentence of explanation. Display provenance keys are data paths
(e.g. `data:line.TESLA-METCALF.x_ohm_per_km`).

**Rejected.** JSON (no comments, so a value cannot explain itself; no compile-time
schema); YAML/TOML (a parser dependency, and still no type checking).

**Why.** "Versioned, human-readable, documented, each value traceable": a typed
literal is as readable as YAML, the compiler rejects a malformed record, and the
source key is enforced by the type.
