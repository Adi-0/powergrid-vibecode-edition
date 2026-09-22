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
- **Simplified:** One modelled day: a hot, clear late-summer weekday. **Full treatment:** Many days across seasons and weather, with forecast error and cloud.

## transmission — The transmission network

- **Simplified:** Balanced, positive-sequence model: the three phases are assumed identical, so one phase stands for all three. **Full treatment:** A three-phase model where unbalance matters (it rarely does at transmission voltages, which is why the field uses positive sequence).
- **Simplified:** Load is constant power (P and Q do not change with voltage). **Full treatment:** Voltage-dependent (ZIP) and dynamic load models, including air-conditioner motors that stall at low voltage.
- **Simplified:** Most plants connect straight to a transmission bus; the step-up transformer and generator terminal are modelled only for Moss Landing Unit 1. **Full treatment:** Every unit on its own terminal bus behind its step-up transformer.
- **Simplified:** DC links (Pacific DC Intertie, Trans Bay Cable) are fixed transfers with a flat converter loss. **Full treatment:** Converter models with firing-angle or modulation control, reactive consumption and DC-line resistance.
- **Simplified:** Inverter-based plants run at unity power factor. **Full treatment:** Modern plants regulate voltage within a reactive capability curve.
- **Simplified:** Neighbouring systems are represented by a generator at each intertie with an equivalent governor response. **Full treatment:** The whole Western Interconnection (thousands of buses).

## slack — Who covers the imbalance

- **Simplified:** Textbook power flow names one "slack" bus whose generator absorbs every mismatch. This model spreads the mismatch over many generators instead (distributed slack). **Full treatment:** Governor droop acts in seconds, automatic generation control over minutes, and re-dispatch after that; each is a separate time scale with its own dynamics.

## dispatch — Deciding who runs

- **Simplified:** Units are committed by a priority list and dispatched in merit order, then re-dispatched with a DC network model to respect branch ratings. **Full treatment:** A security-constrained unit commitment (mixed-integer optimisation) with AC network constraints and every contingency.
- **Simplified:** Hydro and storage follow simple peak-shaving rules on a known day. **Full treatment:** Co-optimisation over days, with forecast uncertainty, water rights, reservoir constraints and market bids.
- **Simplified:** Costs are fuel plus carbon plus a small variable cost; interties sell in fixed price blocks. **Full treatment:** Bids, start-up costs, no-load costs, and neighbours' actual markets.
