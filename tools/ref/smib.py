"""Reference critical clearing angles and times for a single machine on an infinite bus.

Offline tool. The system is the textbook single-machine arrangement: a generator
(E' behind X'd = 0.2 pu) through a step-up transformer (0.1 pu) to a bus, two
parallel lines (0.4 pu each) to an infinite bus (V = 1.0 pu). E' = 1.2 pu, H = 5 s,
Pm = 0.8 pu, f0 = 60 Hz. All values are illustrative, of the class the textbooks use
(estimates, not taken from any one book). Two faults, each three-phase and bolted:

  A. at the middle of one line; cleared by opening that line at both ends;
  B. at the sending-end bus (Pmax during the fault = 0); cleared the same way.

For each, the script writes:
  * delta0, deltaMax, deltaCr from the equal-area criterion (closed form);
  * tcrEvent: the time the fault-on trajectory reaches deltaCr, from scipy's DOP853
    (rtol 1e-12, atol 1e-12) with an event function;
  * tcrBisect: the critical clearing time found without the equal-area criterion,
    by bisecting on the clearing time and integrating fault-on then post-fault with
    DOP853, judging stability by whether the first swing turns back;
  * for B, the closed form tcr = sqrt(4H(deltaCr - delta0) / (ws Pm)).

    python tools/ref/smib.py   ->   test/fixtures/smib.json
"""
import json
import math
import os

import numpy as np
import scipy
from scipy.integrate import solve_ivp

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "test", "fixtures", "smib.json"))

E, V, H, PM, F0 = 1.2, 1.0, 5.0, 0.8, 60.0
XD, XT, XL = 0.2, 0.1, 0.4
WS = 2 * math.pi * F0
M = 2 * H / WS


def par(a, b):
    return a * b / (a + b)


def transfer_mid_fault():
    # Star at the sending bus: generator arm XD+XT, line arm XL to the infinite bus,
    # and half the faulted line (XL/2) to the fault (ground). Star-delta: the transfer
    # reactance between the source and the infinite bus.
    a, b, c = XD + XT, XL, XL / 2
    return (a * b + b * c + c * a) / c


def case(pmax2):
    pmax1 = E * V / (XD + XT + par(XL, XL))
    pmax3 = E * V / (XD + XT + XL)
    d0 = math.asin(PM / pmax1)
    dmax = math.pi - math.asin(PM / pmax3)
    cos_cr = (PM * (dmax - d0) + pmax3 * math.cos(dmax) - pmax2 * math.cos(d0)) / (pmax3 - pmax2)
    dcr = math.acos(cos_cr)

    def fault_on(t, x):
        return [x[1], (PM - pmax2 * math.sin(x[0])) / M]

    ev = lambda t, x: x[0] - dcr  # noqa: E731
    ev.terminal = True
    ev.direction = 1
    sol = solve_ivp(fault_on, (0, 5), [d0, 0.0], method="DOP853", rtol=1e-12, atol=1e-12, events=ev)
    t_event = float(sol.t_events[0][0])

    def stable(tc):
        s1 = solve_ivp(fault_on, (0, tc), [d0, 0.0], method="DOP853", rtol=1e-12, atol=1e-12) if tc > 0 else None
        x = s1.y[:, -1] if s1 is not None else np.array([d0, 0.0])

        def post(t, y):
            return [y[1], (PM - pmax3 * math.sin(y[0])) / M]

        turn = lambda t, y: y[1]  # noqa: E731
        turn.terminal = True
        turn.direction = -1
        over = lambda t, y: y[0] - dmax  # noqa: E731
        over.terminal = True
        over.direction = 1
        s2 = solve_ivp(post, (tc, tc + 5), x, method="DOP853", rtol=1e-12, atol=1e-12, events=[turn, over])
        return len(s2.t_events[0]) > 0 and (len(s2.t_events[1]) == 0 or s2.t_events[0][0] < s2.t_events[1][0])

    lo, hi = 0.0, 2.0
    while hi - lo > 1e-7:
        mid = (lo + hi) / 2
        if stable(mid):
            lo = mid
        else:
            hi = mid
    out = {
        "Pmax1": pmax1,
        "Pmax2": pmax2,
        "Pmax3": pmax3,
        "delta0": d0,
        "deltaMax": dmax,
        "deltaCr": dcr,
        "tcrEvent": t_event,
        "tcrBisect": (lo + hi) / 2,
    }
    if pmax2 == 0:
        out["tcrClosed"] = math.sqrt(4 * H * (dcr - d0) / (WS * PM))
    return out


def main():
    data = {
        "tool": f"scipy {scipy.__version__} (solve_ivp, DOP853, rtol=atol=1e-12); numpy {np.__version__}",
        "system": {"E": E, "V": V, "H": H, "Pm": PM, "f0": F0, "Xd_transient": XD, "Xt": XT, "Xline": XL},
        "midLineFault": case(E * V / transfer_mid_fault()),
        "busFault": case(0.0),
    }
    with open(OUT, "w") as f:
        json.dump(data, f, indent=2)
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
