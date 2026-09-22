# What this model simplifies

This file is the source of the in-app **model honesty** panel ("What's simplified
here"). The app imports it at build time and shows the sections that apply to the
current view. Keep it in sync with the code: a test checks every view id used in the
app has a section here.

Format: one `## view-id — Title` section per view or topic. Each item is a bullet
`- **Simplified:** … **Full treatment:** …`.

## global — Everywhere

- **Simplified:** The network is synthetic: roughly the shape of California's grid, with real place names, but not a replica of any real asset, rating or flow. **Full treatment:** A utility or ISO model (tens of thousands of buses) from the WECC base cases, which are confidential critical-energy infrastructure information.
- **Simplified:** Time is quasi-static: each moment is an independent steady-state solution (economic dispatch, then power flow). Nothing between intervals is simulated. **Full treatment:** Unit commitment with start-up costs and minimum run times, and time-domain simulation between operating points.
