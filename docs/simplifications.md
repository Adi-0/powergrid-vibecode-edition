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

## system — The state sheet

- **Simplified:** Each circuit is drawn as a straight line between its two substations. **Full treatment:** Real corridors follow terrain, rights of way and river crossings; line lengths in the model are the great-circle distance times a routing factor (1.15 unless a line gives its own length), not surveyed routes.
- **Simplified:** Geography is projected equirectangularly about the middle of the state, accurate to a few percent. **Full treatment:** A conformal projection (e.g. California Albers or UTM zones) for surveyed distances.
- **Simplified:** The state is drawn as a slab 30 km thick so its coast reads as a cut section; the thickness means nothing. Neighbouring states are drawn only in a band around California. **Full treatment:** Not applicable — this is drawing convention, stated so it is not mistaken for data.

## trip — Tripping a circuit

- **Simplified:** A trip is shown as the moment after: the dispatch stays as planned with the circuit in service, and generators' governors cover the change in losses. **Full treatment:** Within minutes, operators re-dispatch generation (security-constrained economic dispatch with the circuit out) to bring any overloaded circuit back under its rating, and protection may already have acted.
- **Simplified:** A circuit is either in service or open at both ends; nothing between. **Full treatment:** Breaker failure, one end open (the line charging from the other), and automatic reclosing.
- **Simplified:** When the power flow finds no operating point, the sheet says so and draws nothing as solved. Failing to find one is strong evidence that none exists, not proof. **Full treatment:** Continuation power flow traces the P–V curve to its nose and proves where the operating point disappears.

## region — A region's layers

- **Simplified:** Layer heights mean nothing but order (lowest voltage lowest); the spacing is chosen for legibility. **Full treatment:** Not applicable — drawing convention.
- **Simplified:** Each substation's buses of one voltage are one bus; its transformers of one kind are drawn as banks side by side. **Full treatment:** Breaker-and-a-half or double-bus arrangements with bus sections, drawn at the Substation level.
- **Simplified:** A region's losses are computed by difference (generated + arriving − taken). **Full treatment:** The same number summed branch by branch; they agree because the power flow conserves power, which the tests check.

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

## distribution — Feeders and services

- **Simplified:** One feeder (Evergreen 1105) is modelled phase by phase down to each meter; the other feeders on its substation bank are one balanced load. **Full treatment:** Every feeder, every customer, from a utility's GIS.
- **Simplified:** Neutrals are treated as perfectly grounded (Kron reduction), so neutral-to-earth voltage is zero everywhere. **Full treatment:** Keep the neutral as a conductor with finite grounding resistance at each pole; stray voltage and neutral currents then show up.
- **Simplified:** Home loads are smooth average profiles with a fixed split between the two 120 V legs and the 240 V air conditioner; appliances are constant power. **Full treatment:** Measured smart-meter data, appliance-level models, motor behaviour at low voltage.
- **Simplified:** The feeder's unbalance reaches the transmission model only as its total three-phase power. **Full treatment:** A three-phase transmission model near the substation, which would show the negative-sequence current the unbalance causes.
- **Simplified:** Distribution transformers split their impedance between primary and the two half windings by a fixed rule (0.5R + j0.8X, R + j0.4X). **Full treatment:** Measured impedances for each winding pair.
