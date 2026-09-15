# 0019 — Less at once, more on demand

**Status:** adopted, after the third review

The reviewer's judgement after the second quality pass was short and exact:
there is a LOT thrown at the reader; information is valuable, but so are levels
and presentation; and some of the map's names looked like they were pointing at
places outside California.

The second point is the substantial one, and it has a shape. The project's
ambition — a resource that a person can *discover, learn, witness, and explore
down to the fundamentals* — is not served by putting everything on the page at
once. It is served by a page a reader can take in, that opens when asked.

## The names were pointing off the map

Eleven of thirty-three labels on the whole-state view had their site inside
California and their own text outside it.

This was a regression introduced by the previous pass. Preferring the least ink
under a caption — added to stop names landing in the middle of corridors — sends
a caption to the emptiest paper within reach, and on a map the emptiest paper is
off the edge of the subject. San Diego, Moss Landing and Imperial Valley all
went out to sea or over Mexico, each on a hairline leader.

Cartographers have always pushed a coastal name inland. The inward direction
here is the direction of the middle of the ink, which every scene has without
knowing anything about geography.

The ordering has to DOMINATE the ink, and that is the part that took two
attempts. Minimising ink across all candidates at once looks like the same thing
and is not: the emptiest paper within reach of a coastal site *is* the sea, so
least-ink kept winning. Candidates are now grouped — beside it and inward, at
arm's length inward, beside it and outward — each group exhausted before the
next, and the cleanest spot chosen within a group. There is deliberately no
fourth group: a name that fits nowhere inward and nowhere beside its point is
dropped rather than held out over open water, where it reads as the name of the
water.

Eleven of thirty-three became three of thirty-six, and
`tools/label-geography.mjs` fails above three.

## One setting for how much the drawing says out loud

`TEXT · Least · Normal · All`, in the footer beside the way in.

| Setting | What it prints |
|---|---|
| **Least** | The names you need to orient. No values anywhere. |
| **Normal** | Names, and a number where the number is the point. The default. |
| **All** | Every name each scene can give, with a number under all of them. |

It governs type only. No setting changes a line, a symbol or a solution: it is
the same drawing, differently annotated. Each scene applies it at the gates it
already had, because only the scene knows which of its captions is the one worth
keeping when there is room for one. On the substation single-line that is eight
names at Least, twenty at Normal and all thirty-eight at All.

**What makes Least quiet rather than lossy** is the rule below. Without it the
setting would be a way to hide things, which is not what was asked for.

## Everything answers when pointed at

Every pickable thing now carries a two-line readout — its name and one live
value — supplied by the scene that drew it, because the scene is the only thing
that knows both what an object is called and what the solver says it is doing.
A lookup table in the app would have been a second copy of that knowledge, wrong
by the third time somebody added a device.

A pole with no caption still says `Pole 1201-4 · 1.0027 pu · 1.07 km`; so does a
surge arrester, a service conductor, and the exhaust duct between a gas turbine
and its boiler — which was the one thing in the plant drawing that said nothing
when pointed at, despite being the subject of it.

Two of the sixty sites also say where the depth is: pointing at Eden Vale reads
`18.9 MW in · zoom in: the substation, the feeder, one house`. Nothing on the
page used to say which circles opened into levels of their own, and the
breadcrumb, which names the levels, cannot say which dot leads to them.

## The legend is the filter

Asking to see one voltage class is the most useful filter this drawing can
offer — "so where does the backbone actually go" is the question a reader has
about thirty seconds after arriving — and it needed no new control. The legend
is already on the page, already names every class, and is where a reader looks
to find out what a weight means.

**It recedes the rest, it does not delete them.** Hiding the other classes
answers the question and destroys the one worth asking, which is where the
backbone runs relative to everything else: the whole point of a backbone is what
it is the backbone OF.

## A level leads with one line and opens up when asked

Information is not free because it is true. Every level opened with everything
it had to say, so arriving anywhere meant reading three paragraphs before
looking at the drawing — and the drawing is the thing that is supposed to be
doing the explaining.

The first line stays; the rest sits behind a disclosure whose summary is phrased
as the question it answers: *How to read the streams*, *Why the rotor is drawn
on a slant*, *The four ratios a system is planned with*, *Put a fault
somewhere*. The last of those is the pattern at its best — a summary that reads
as an invitation is as discoverable as a heading over eight buttons and costs
one line instead of two hundred pixels.

An opened paragraph stays open: the panel re-renders whenever the solution
changes, and a disclosure snapping shut because the clock moved is the kind of
thing that makes an interface feel hostile.

## A name without its number beats no name at all

A two-line caption needs about twice the room of a one-line one, and in the
corner of a map where six places sit inside forty kilometres that is the
difference between being placed and being dropped. Every caption is now tried
twice — once as the scene offered it, once as the name alone.

Thirty labels became thirty-six, and the six that arrived are the ones that had
been losing: Rio Oso, Big Creek, Helms, Vincent, Lugo, San Gorgonio Pass. The
crowded corners carry less type, not more, because what fits there now fits on
one line.

## What is still not right

- **The three coastal names.** San Diego, Martin and Morro Bay sit on a coast
  with the sea one side and a dense cluster of names on the other. A leader into
  open water is what a printed map does there too, but it is still the weakest
  thing on the page.
- **The region scale**, the **20–30 m/px gap** and the **plant's one empty
  corner** are carried forward unchanged from 0018.
