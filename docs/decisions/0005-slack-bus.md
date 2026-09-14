# 0005 — The slack bus is the Pacific Northwest intertie

**Status:** accepted · **Phase:** 1

## Chosen

The slack bus is **Malin 500 kV**, the California–Oregon Intertie, modelled as an
import rather than as a plant.

## Why

Every power flow needs one bus where voltage angle is the reference and real
power is whatever the network turns out to need. Most teaching models pick a
large in-state generator and move on. That is a modelling convenience that
teaches a beginner something false: that a state's grid balances itself.

It does not. California is bolted to everything from British Columbia to New
Mexico, imports roughly a quarter to a third of its energy, and when demand
inside the state does not match what its own generators are producing, the rest
of the Western Interconnection makes up the difference **through exactly these
wires**. Putting the slack there means the thing the solver does — absorb the
imbalance at one bus — is the thing that physically happens at that bus.

It also gives the UI something honest to show: the difference between the
intertie's dispatch target and its solved output is the correction the rest of
the interconnection is silently making, which is displayed rather than hidden.

## Consequence, and the simplification it carries

In reality that correction is shared across many units by automatic generation
control, not dumped on one tie. The model-honesty panel says so. See
`docs/simplifications.md`.
