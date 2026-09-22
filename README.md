# Grid Atlas

An isometric, zoomable, explorable model of the California power grid, built to teach
someone who knows nothing about electricity how a power system works — by letting
them look at one.

- `npm install` then `npm run dev` — open the printed URL.
- `npm test` — solver fixtures and consistency tests.
- `npm run build` — static site in `dist/` (no backend, no runtime network requests).
- `npm run shots` — headless screenshots of every view into `screenshots/`.

See `CLAUDE.md` for the rules the build follows, `docs/model.md` for the physics and
parameter sources, `docs/simplifications.md` for what the model leaves out, and
`docs/decisions/` for why things are the way they are.

The network is synthetic. It is named after real places so the geography is
recognisable, but it is not a replica of any real asset.
