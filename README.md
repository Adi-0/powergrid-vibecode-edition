# Grid Atlas

An isometric, zoomable, explorable model of the California power grid — built to
test whether a person can understand a power system more deeply by moving
through a correct visual model of it than by reading about it.

It opens on the whole state. Zoom into anything and it resolves into its
constituent parts, and keeps resolving: a region into circuits and substations,
a substation into transformers and breakers, a feeder into poles and service
drops, a plant into its energy conversion chain, a generator into a rotating
field and three windings — all the way down to the governing equations, with
live numbers in them.

**Status:** phases 1–5 of 8 complete. See [PROGRESS.md](PROGRESS.md).

The chain now runs end to end: the Oregon intertie, the 500 kV backbone, a
115/12.47 kV substation you can watch stand up out of its own single-line
diagram, three kilometres of distribution feeder drawn pole by pole, and a
socket in a kitchen. One power flow solves all of it, so switching on a kettle
at 14 Cherry Lane really does move the number at the top of the page. Select
anything and the math panel shows the full working behind it — and the
arithmetic on screen is the arithmetic the tests evaluate, character for
character.

## The two rules

**Standard notation, exactly as the field uses it.** Real symbols, real
terminology, IEEE/ANSI conventions. `S = P + jQ`, `V∠θ`, `Z = R + jX`, ANSI
C84.1 voltage classes, ANSI/IEEE C37.2 device numbers. Plain-language
*explanation* alongside standard *notation*, always both — because anyone who
learns bespoke vocabulary here would have to unlearn it the moment they met a
real one-line diagram.

**Every calculation must be reproducible by hand.** Nothing here is a magic
number. A line's impedance is computed from a published conductor table, a tower
geometry and a route length. A transformer's comes from its percentage impedance
and X/R ratio. The math panel shows the general form of each equation, then the
same equation with this object's values substituted, then the arithmetic, then
the result with units.

## Accuracy stance

Physically faithful, not asset-accurate. Every equation is the real equation.
Conservation holds everywhere, to solver tolerance, at every level. Cause and
effect are real: trip a line and flows redistribute per an actual power flow
solution, never a scripted animation.

The network is a **synthetic reconstruction** of California — 90 buses, from the Oregon border to one wall outlet — real place
names at real coordinates, plausible circuits between them. It is not a replica
and never claims to be. What the model does not represent is written down in
[docs/simplifications.md](docs/simplifications.md), generated from the same data
the in-app model-honesty panel reads, so the two cannot disagree.

## Documentation

- [PROGRESS.md](PROGRESS.md) — state of the build
- [docs/style.md](docs/style.md) — the visual language, and why each rule exists
- [docs/model.md](docs/model.md) — every parameter and where it came from
- [docs/simplifications.md](docs/simplifications.md) — what the model leaves out
- [docs/decisions/](docs/decisions/) — what was chosen, what was rejected, why

## Running

```
npm install
npm test        # 287 tests
npm run dev     # the app
```
