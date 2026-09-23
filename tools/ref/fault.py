"""Reference fault currents for a textbook-class four-bus system, solved with OpenDSS.

Offline tool. The system is the arrangement the textbooks use to teach symmetrical
components (values illustrative, of the class Grainger & Stevenson and Glover,
Overbye & Sarma use; not taken from any one book), on a 100 MVA base:

  G1 (13.8 kV; X1 0.15, X2 0.17, X0 0.05 pu, neutral reactor Xn 0.05 pu)
    -> T1 (13.8 kV delta / 138 kV grounded wye, X 0.10 pu)
    -> line 2-3 (Z1 0.02 + j0.20, Z0 0.06 + j0.60 pu)
    -> T2 (138 kV grounded wye / 13.8 kV delta, X 0.10 pu)
    -> G2 (13.8 kV; X1 0.20, X2 0.22, X0 0.08 pu, solidly grounded)

No load, no line charging: every pre-fault voltage is 1.0 pu (with the delta-wye
banks' 30 degree shifts). OpenDSS solves each fault in the phase domain (no
symmetrical components), so it is an independent check of the sequence-network
method. For each fault the script records the phase currents into the fault, the
phase currents in the line at bus 2 and in T1's 138 kV winding, and the bus voltages.

    python tools/ref/fault.py   ->   test/fixtures/fault-4bus.json
"""
import json
import math
import os

import opendssdirect as dss

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "test", "fixtures", "fault-4bus.json"))

SB = 100.0  # MVA
ZB_LV = 13.8**2 / SB
ZB_HV = 138.0**2 / SB
R_FAULT = 1e-4  # ohm, OpenDSS needs a finite fault resistance

SYS = {
    "G1": {"x1": 0.15, "x2": 0.17, "x0": 0.05, "xn": 0.05},
    "G2": {"x1": 0.20, "x2": 0.22, "x0": 0.08, "xn": 0.0},
    "T1": {"x": 0.10},
    "T2": {"x": 0.10},
    "L23": {"r1": 0.02, "x1": 0.20, "r0": 0.06, "x0": 0.60},
    "rFaultOhm": R_FAULT,
}


def build():
    g1, g2 = SYS["G1"], SYS["G2"]
    t1, t2, ln = SYS["T1"], SYS["T2"], SYS["L23"]
    cmds = [
        "clear",
        # G1 as the circuit's source: Z0 includes 3 Xn (the neutral reactor)
        f"new circuit.fault4 bus1=b1 basekv=13.8 pu=1.0 angle=0 "
        f"Z1=[0, {g1['x1'] * ZB_LV}] Z2=[0, {g1['x2'] * ZB_LV}] Z0=[0, {(g1['x0'] + 3 * g1['xn']) * ZB_LV}]",
        f"new transformer.T1 phases=3 windings=2 buses=[b1 b2] conns=[delta wye] kvs=[13.8 138] kvas=[100000 100000] "
        f"XHL={t1['x'] * 100} %Rs=[0 0] %noloadloss=0 %imag=0",
        f"new line.L23 bus1=b2 bus2=b3 phases=3 length=1 units=none "
        f"R1={ln['r1'] * ZB_HV} X1={ln['x1'] * ZB_HV} R0={ln['r0'] * ZB_HV} X0={ln['x0'] * ZB_HV} C1=0 C0=0",
        f"new transformer.T2 phases=3 windings=2 buses=[b3 b4] conns=[wye delta] kvs=[138 13.8] kvas=[100000 100000] "
        f"XHL={t2['x'] * 100} %Rs=[0 0] %noloadloss=0 %imag=0",
        f"new vsource.G2 bus1=b4 basekv=13.8 pu=1.0 angle=0 "
        f"Z1=[0, {g2['x1'] * ZB_LV}] Z2=[0, {g2['x2'] * ZB_LV}] Z0=[0, {(g2['x0'] + 3 * g2['xn']) * ZB_LV}]",
        "set voltagebases=[13.8 138]",
        "calcvoltagebases",
    ]
    for c in cmds:
        dss.Text.Command(c)


def currents(el):
    dss.Circuit.SetActiveElement(el)
    v = dss.CktElement.Currents()
    return [[v[2 * i], v[2 * i + 1]] for i in range(len(v) // 2)]


def bus_v(name):
    dss.Circuit.SetActiveBus(name)
    kvb = dss.Bus.kVBase() * 1000
    v = dss.Bus.Voltages()
    return [[v[2 * i] / kvb, v[2 * i + 1] / kvb] for i in range(3)]


FAULTS = [
    ("b3", "3ph", "phases=3 bus1=b3"),
    ("b3", "slg", "phases=1 bus1=b3.1"),
    ("b3", "ll", "phases=1 bus1=b3.2 bus2=b3.3"),
    ("b3", "dlg", "phases=2 bus1=b3.2.3"),
    ("b2", "slg", "phases=1 bus1=b2.1"),
    ("b1", "slg", "phases=1 bus1=b1.1"),
    ("b4", "3ph", "phases=3 bus1=b4"),
]


def main():
    out = {
        "tool": f"OpenDSS via OpenDSSDirect.py {dss.__version__} ({dss.Basic.Version().split(' [')[0]})",
        "system": SYS,
        "baseMVA": SB,
        "faults": [],
    }
    for bus, kind, spec in FAULTS:
        build()
        dss.Text.Command(f"new fault.F {spec} r={R_FAULT}")
        dss.Text.Command("solve")
        assert dss.Solution.Converged()
        ibase = SB * 1e6 / (math.sqrt(3) * (13.8e3 if bus in ("b1", "b4") else 138e3))
        ibase_hv = SB * 1e6 / (math.sqrt(3) * 138e3)
        fc = currents("Fault.F")
        rec = {
            "bus": bus,
            "type": kind,
            # fault element currents at terminal 1, amperes -> pu on the faulted bus's base
            "faultCurrentPu": [[x / ibase, y / ibase] for x, y in fc[: len(fc) // 2]],
            "faultPhases": spec,
            "lineAtB2Pu": [[x / ibase_hv, y / ibase_hv] for x, y in currents("Line.L23")[:3]],
            "t1HvPu": [[x / ibase_hv, y / ibase_hv] for x, y in currents("Transformer.T1")[4:7]],
            "voltagesPu": {b: bus_v(b) for b in ("b1", "b2", "b3", "b4")},
        }
        out["faults"].append(rec)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps({"tool": out["tool"], "n": len(out["faults"])}))
    for r in out["faults"]:
        mags = [round(math.hypot(*z), 5) for z in r["faultCurrentPu"]]
        print(r["bus"], r["type"], mags)


if __name__ == "__main__":
    main()
