# 0002 — Typeface: Atlas Sans (IBM Plex Sans subset + drawn ANGLE)

**Chosen.** IBM Plex Sans (Regular, Italic, SemiBold), subset to Latin, Greek,
punctuation, super/subscripts, arrows and math operators, with U+2220 ANGLE and
U+2225 PARALLEL drawn in at Plex's operator stroke weight, renamed "Atlas Sans"
(Plex's OFL Reserved Font Name requires the rename). Built by
`tools/font/build_font.py`; the woff2 files and OFL licence are committed.

**Why Plex.** Designed as an engineering face (IBM), neutral grotesque with an
industrial construction; **its default figures are tabular** (all digits 600 units)
so live readouts never change width; it has Greek (δ, θ, φ, ω, Ω) and most operators.
Italic is the same family, used for variables per standard maths typesetting.

**Rejected.** Barlow (thematically perfect — drawn from California highway signage —
but no Greek); Inter (fashionable UI face, the opposite of what the brief asks);
B612 (cockpit legibility, but Latin only); Source Sans 3 (fine, but humanist rather
than engineered, and also lacks ∠); KaTeX fonts or a system fallback for ∠ (a second
typeface for one glyph). Monospace for labels (the brief calls it a costume).
