# 0012 — Sun, wind and demand

**Chosen.** Solar output is computed from sun position (NOAA general solar position
equations), clear-sky beam irradiance (Meinel), plane-of-array geometry (single-axis
trackers or fixed tilt), cell temperature (NOCT model) with a regional air-temperature
curve, DC/AC ratio and inverter clipping. Rooftop (behind-the-meter) solar is the same
chain on fixed south-facing roofs with a diversity factor, netted from customer
demand. Wind and demand are hourly shapes of the kind CAISO publishes (estimates).
One modelled day: a hot, clear late-summer weekday (15 August).

**Why.** The duck curve must emerge from the model, not be drawn: here it emerges
from the sun's geometry against an air-conditioning demand curve.
